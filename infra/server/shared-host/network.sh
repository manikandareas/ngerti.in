#!/usr/bin/env bash
set -euo pipefail

# A separate network namespace prevents the private daemon from modifying Dokploy's rules.
[[ $(id -u) == 0 && $(sysctl -n net.ipv4.ip_forward) == 1 ]]
namespace=ngertiin
uplink=ngertiin-host
if ! ip netns list | awk '{print $1}' | grep -qx "$namespace"; then
  if ip link show "$uplink" >/dev/null 2>&1 || ip route show | grep -q '172\.31\.82\.'; then
    echo 'The declared Ngertiin transit network is already allocated.' >&2
    exit 1
  fi
  ip netns add "$namespace"
  ip link add "$uplink" type veth peer name ngertiin-peer
  ip link set ngertiin-peer netns "$namespace"
  ip addr add 172.31.82.1/30 dev "$uplink"
  ip link set "$uplink" up
  ip -n "$namespace" link set ngertiin-peer name eth0
  ip -n "$namespace" addr add 172.31.82.2/30 dev eth0
  ip -n "$namespace" link set eth0 up
  ip -n "$namespace" link set lo up
  ip -n "$namespace" route add default via 172.31.82.1
fi
ip -n "$namespace" -4 addr show eth0 | grep -q '172.31.82.2/30'
install -d -m 755 /etc/netns/ngertiin
printf 'nameserver 1.1.1.1\nnameserver 1.0.0.1\n' > /etc/netns/ngertiin/resolv.conf
external=$(ip -4 route show default | awk 'NR==1 {print $5}')
[[ $external =~ ^[a-zA-Z0-9_.-]+$ ]]

# Every host rule is limited to this one transit interface/address. Existing chains are retained.
iptables -w -N NGERTIIN82 2>/dev/null || true
iptables -w -C NGERTIIN82 -i "$uplink" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
  iptables -w -I NGERTIIN82 1 -i "$uplink" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
if ! iptables -w -C FORWARD -j NGERTIIN82 2>/dev/null; then
  for range in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16; do
    iptables -w -A NGERTIIN82 -i "$uplink" -d "$range" -j DROP
  done
  iptables -w -A NGERTIIN82 -i "$uplink" -s 172.31.82.2/32 -o "$external" -j ACCEPT
  iptables -w -A NGERTIIN82 -o "$uplink" -d 172.31.82.2/32 -s 172.16.0.0/24 -p tcp --dport 8082 -j ACCEPT
  iptables -w -A NGERTIIN82 -o "$uplink" -d 172.31.82.2/32 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -w -A NGERTIIN82 -i "$uplink" -j DROP
  iptables -w -A NGERTIIN82 -o "$uplink" -j DROP
  iptables -w -A NGERTIIN82 -j RETURN
  iptables -w -I FORWARD 1 -j NGERTIIN82
fi
iptables -w -t nat -C POSTROUTING -s 172.31.82.2/32 -o "$external" -j MASQUERADE 2>/dev/null || \
  iptables -w -t nat -A POSTROUTING -s 172.31.82.2/32 -o "$external" -j MASQUERADE
iptables -w -C INPUT -i "$uplink" -j DROP 2>/dev/null || iptables -w -I INPUT 1 -i "$uplink" -j DROP
# Host-originated replies (including operator diagnostics) must precede the scoped drop.
iptables -w -C INPUT -i "$uplink" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
  iptables -w -I INPUT 1 -i "$uplink" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip netns exec "$namespace" sysctl -qw net.ipv4.ip_forward=1
ip netns exec "$namespace" iptables -w -C INPUT -i lo -j ACCEPT 2>/dev/null || \
  ip netns exec "$namespace" iptables -w -A INPUT -i lo -j ACCEPT
ip netns exec "$namespace" iptables -w -C INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
  ip netns exec "$namespace" iptables -w -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip netns exec "$namespace" iptables -w -C INPUT -i eth0 -p tcp --dport 8082 -j ACCEPT 2>/dev/null || \
  ip netns exec "$namespace" iptables -w -A INPUT -i eth0 -p tcp --dport 8082 -j ACCEPT
ip netns exec "$namespace" iptables -w -P INPUT DROP
echo 'Private transit namespace ready; only application ingress is reachable.'
