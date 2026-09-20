"""Per-user map preferences in the central database; local storage is a cache."""
from __future__ import annotations

import hashlib
import json
import voluptuous as vol
from homeassistant.components import websocket_api

from .database import DatabaseStore


def _key(connection, card: str) -> str:
    # Never trust a client-supplied user ID.
    return 'preferences:' + connection.user.id + ':' + hashlib.sha256(card.encode()).hexdigest()


@websocket_api.websocket_command({vol.Required('type'): 'cardata_analytics/preferences/get',
                                 vol.Required('card'): vol.All(str, vol.Length(min=1, max=200))})
@websocket_api.async_response
async def websocket_get(hass, connection, msg):
    value = await DatabaseStore(hass, 1, _key(connection, msg['card'])).async_load()
    connection.send_result(msg['id'], {'preferences': value})


@websocket_api.websocket_command({vol.Required('type'): 'cardata_analytics/preferences/save',
                                 vol.Required('card'): vol.All(str, vol.Length(min=1, max=200)),
                                 vol.Required('preferences'): dict})
@websocket_api.async_response
async def websocket_save(hass, connection, msg):
    value = msg['preferences']
    try:
        size = len(json.dumps(value, allow_nan=False).encode())
    except (ValueError, TypeError):
        connection.send_error(msg['id'], 'invalid_format', 'Invalid preference values')
        return
    if size > 65536:
        connection.send_error(msg['id'], 'invalid_format', 'Preferences exceed 64 KiB')
        return
    await DatabaseStore(hass, 1, _key(connection, msg['card'])).async_save(value)
    connection.send_result(msg['id'])


def async_register_websocket(hass):
    websocket_api.async_register_command(hass, websocket_get)
    websocket_api.async_register_command(hass, websocket_save)
