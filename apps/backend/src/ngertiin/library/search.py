"""One parameterized, bounded PostgreSQL search shared by UI and agent."""

from fastapi import HTTPException
from psycopg.errors import QueryCanceled

from ngertiin.async_db import transaction
from ngertiin.library.catalogue import ROWS
from ngertiin.library.contracts import SearchInput


def item(row):
    return {
        "ref": {
            k: str(row[k]) if k in ("id", "revision_id") and row[k] else row[k]
            for k in ("kind", "id", "revision", "revision_id")
        },
        "thread_id": str(row["thread_id"]) if row["thread_id"] else None,
        "title": row["title"][:200],
        "status": row["status"],
        "updated_at": row["updated_at"].isoformat(),
        "snippet": row.get("snippet", ""),
    }


async def search(owner, spec: SearchInput):
    # Sort is selected from constants; all user input uses bound parameters.
    order = {
        "relevance": "score DESC,updated_at DESC,kind,id",
        "recent": "updated_at DESC,kind,id",
        "title": "lower(title),kind,id",
    }[spec.sort]
    query = (
        """
    WITH resources AS ("""
        + ROWS
        + """), scoped AS (
      SELECT *,to_tsvector('simple',title || ' ' || left(body,120000) || ' ' ||
      regexp_replace(title || ' ' || left(body,120000),'[[:punct:]]',' ','g') || ' ' ||
      replace(title || ' ' || left(body,120000),'-','')) AS document,
      plainto_tsquery('simple',%(q)s) AS terms FROM resources WHERE owner_id=%(owner)s
      AND (cardinality(%(kinds)s::text[])=0 OR kind=ANY(%(kinds)s::text[]))
      AND (%(since)s::timestamptz IS NULL OR updated_at>=%(since)s)
      AND (%(until)s::timestamptz IS NULL OR updated_at<%(until)s)
    ) SELECT kind,id,revision,revision_id,thread_id,title,status,updated_at,
      CASE WHEN %(q)s='' THEN 0 ELSE
      ts_rank(document,terms) + CASE WHEN strpos(lower(title),lower(%(q)s))>0
      THEN 2 ELSE 0 END END AS score,
      left(regexp_replace(CASE WHEN %(q)s='' THEN left(body,200)
       ELSE ts_headline('simple',left(body,120000),terms,
       'StartSel="",StopSel="",MaxWords=28,MinWords=8') END,'[[:space:]]+',' ','g'),300) AS snippet
      FROM scoped WHERE %(q)s='' OR document @@ terms
      OR strpos(lower(title),lower(%(q)s))>0
      ORDER BY """
        + order
        + " LIMIT %(limit)s OFFSET %(offset)s"
    )
    try:
        async with transaction() as conn:
            await conn.execute("SET LOCAL statement_timeout='4000ms'")
            rows = await (
                await conn.execute(
                    query,
                    {
                        "q": spec.query,
                        "owner": owner,
                        "kinds": spec.kinds,
                        "since": spec.since,
                        "until": spec.until,
                        "limit": spec.limit + 1,
                        "offset": spec.offset,
                    },
                )
            ).fetchall()
    except QueryCanceled as error:
        raise HTTPException(
            503, "Pencarian belum selesai. Persempit kata atau jenisnya."
        ) from error
    return {
        "items": [item(row) for row in rows[: spec.limit]],
        "next_offset": spec.offset + spec.limit if len(rows) > spec.limit else None,
        "query": spec.query,
        "message": "Referensi ditemukan; isi lengkap belum dibaca.",
    }
