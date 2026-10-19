"""Bounded HTTPS requests; upstream payloads and secrets never become public errors."""

import httpx

from ngertiin.billing.contracts import ProviderUnavailable


async def request(method, url, **kwargs):
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            if len(response.content) > 2_000_000:
                raise ProviderUnavailable("Provider response too large")
            return response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise ProviderUnavailable("Provider request unavailable") from error
