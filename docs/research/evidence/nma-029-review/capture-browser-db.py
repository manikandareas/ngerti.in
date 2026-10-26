import hashlib,json,sqlite3,sys
from pathlib import Path
meta=json.loads(Path(".dev/nma-025-browser.json").read_text())
with sqlite3.connect(Path(meta["root"])/"state/state.db") as db:
    messages=db.execute("SELECT * FROM nma_messages WHERE thread_id=? ORDER BY message_seq",(meta["thread"],)).fetchall()
    controls=db.execute("SELECT command_id,body,result FROM nma_commands WHERE json_extract(body,'$.type') IN ('session.reset','session.compress') ORDER BY rowid").fetchall()
    tips=db.execute("SELECT logical_session_id,native_tip,context_watermark FROM nma_session_lineage ORDER BY binding_id").fetchall()
    native=db.execute("SELECT key,value FROM state_meta WHERE key LIKE 'gateway.mutation.v1.%' ORDER BY key").fetchall()
value={"thread":meta["thread"],"message_count":len(messages),"message_sha256":hashlib.sha256(json.dumps(messages,sort_keys=True).encode()).hexdigest(),"controls":[{"command_id":r[0],"body":json.loads(r[1]),"result":json.loads(r[2]) if r[2] else None} for r in controls],"lineage":tips,"native_receipts":[{"key":r[0],"value":json.loads(r[1])} for r in native]}
Path(sys.argv[1]).write_text(json.dumps(value,indent=2)+"\n")
print({"messages":len(messages),"controls":len(controls),"native_receipts":len(native)})
