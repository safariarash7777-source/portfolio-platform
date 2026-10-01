"""Test-process guard: allow loopback only; never use this in live maintenance."""
import socket
connect=socket.socket.connect
connect_ex=socket.socket.connect_ex
getaddrinfo=socket.getaddrinfo
def allowed(address):return isinstance(address,tuple) and address[0] in ('127.0.0.1','::1','localhost')
def guarded(sock,address):
    if not allowed(address):raise OSError('Test upstream connection denied')
    return connect(sock,address)
def guarded_ex(sock,address):
    if not allowed(address):raise OSError('Test upstream connection denied')
    return connect_ex(sock,address)
def guarded_dns(host,*args,**kwargs):
    if host not in ('127.0.0.1','::1','localhost',None):raise OSError('Test upstream DNS denied')
    return getaddrinfo(host,*args,**kwargs)
socket.socket.connect=guarded
socket.socket.connect_ex=guarded_ex
socket.getaddrinfo=guarded_dns
