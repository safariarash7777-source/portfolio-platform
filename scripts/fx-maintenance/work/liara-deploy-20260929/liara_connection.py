"""Bounded selection of the existing Liara connection; TLS/SSH policy unchanged."""
import os,socket

def proxy_mapping(setting=None,probe=None):
    setting=os.environ.get('FX_LIARA_PROXY','auto') if setting is None else setting
    if setting=='direct':return {}
    if setting!='auto':
        if not setting.startswith(('http://','https://')):raise ValueError('Invalid Liara proxy setting')
        return {'https':setting}
    probe=probe or socket.create_connection
    try:
        connection=probe(('127.0.0.1',2080),timeout=.5)
        connection.close()
    except OSError:return {}
    return {'https':'http://127.0.0.1:2080'}
