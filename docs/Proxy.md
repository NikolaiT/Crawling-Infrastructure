## Everything regarding proxies


### Setup anonymous squid3 proxy server

Useful for testing of proxy functionality.
Tutorial: https://gist.github.com/RobinDev/1c1c8da1cc972545c7b4

Squid3 config file:

```
#Recommended minimum configuration:
#acl manager proto cache_object
#acl localhost src 127.0.0.1/32
#acl to_localhost dst 127.0.0.0/8
acl localnet src 0.0.0.0/8 192.168.100.0/24 192.168.101.0/24
acl SSL_ports port 443
acl Safe_ports port 80          # http
acl Safe_ports port 21          # ftp
acl Safe_ports port 443         # https
acl Safe_ports port 70          # gopher
acl Safe_ports port 210         # wais
acl Safe_ports port 1025-65535  # unregistered ports
acl Safe_ports port 280         # http-mgmt
acl Safe_ports port 488         # gss-http
acl Safe_ports port 591         # filemaker
acl Safe_ports port 777         # multiling http

acl CONNECT method CONNECT

http_access allow manager localhost
http_access deny manager
http_access deny !Safe_ports

http_access deny to_localhost
icp_access deny all
htcp_access deny all

http_port 3128
hierarchy_stoplist cgi-bin ?
access_log /var/log/squid3/access.log squid

#Suggested default:
refresh_pattern ^ftp:           1440    20%     10080
refresh_pattern ^gopher:        1440    0%      1440
refresh_pattern -i (/cgi-bin/|\?) 0 0% 0
refresh_pattern .               0       20%     4320
# Leave coredumps in the first cache dir
coredump_dir /var/spool/squid3

# Allow all machines to all sites
# http_access allow all

header_access Allow allow all
header_access Authorization allow all
header_access Cache-Control allow all
header_access Content-Encoding allow all
header_access Content-Length allow all
header_access Content-Type allow all
header_access Date allow all
header_access Expires allow all
header_access Host allow all
header_access If-Modified-Since allow all
header_access Last-Modified allow all
header_access Location allow all
header_access Pragma allow all
header_access Accept allow all
header_access Accept-Enncoding allow all
header_access Accept-Language allow all
header_access Content-Language allow all
header_access Mime-Version allow all
header_access Cookie allow all
header_access Set_Cookie allow all
header_access Retry-After allow all
header_access Title allow all
header_access Connection allow all
header_access Proxy-Connection allow all
header_access All deny all

via off

forwarded_for delete
```
