

For Server PC:

For DNS Queries Inbound/Outbound
netsh advfirewall firewall add rule name="Chakhdi DNS UDP 53" dir=in action=allow protocol=UDP localport=53
netsh advfirewall firewall add rule name="Chakhdi DNS TCP 53" dir=in action=allow protocol=TCP localport=53

For Client PC:

On Proxy Setting while routing to Server add below:
server.chakhdi.local;*.local;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*