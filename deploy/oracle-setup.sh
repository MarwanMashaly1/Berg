#!/usr/bin/env bash
# oracle-setup.sh — First-time Berg API setup on Oracle Cloud Always Free (Ampere A1 / Ubuntu 22.04)
# Run as: sudo bash oracle-setup.sh
set -euo pipefail

REPO_URL="https://github.com/YOUR_ORG/berg.git"   # ← change this
REPO_DIR="/opt/berg"
API_DIR="$REPO_DIR/packages/api"
DOMAIN=""   # ← set your API domain, e.g. api.bergapp.com

echo "════════════════════════════════════════"
echo " Berg API — Oracle Cloud Setup"
echo "════════════════════════════════════════"

# ── 0. Require root ───────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash oracle-setup.sh"; exit 1
fi

# ── 1. System packages ────────────────────────────────────────────────────────
apt-get update -q
apt-get install -y -q \
  curl git ca-certificates gnupg lsb-release \
  netfilter-persistent iptables-persistent

# Install Docker (official repo for latest version)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Install Caddy (official repo)
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/caddy.gpg
echo "deb [signed-by=/etc/apt/keyrings/caddy.gpg] \
  https://dl.cloudsmith.io/public/caddy/stable/deb/ubuntu any-version main" \
  | tee /etc/apt/sources.list.d/caddy.list > /dev/null
apt-get update -q
apt-get install -y -q caddy

# Allow ubuntu user to run docker without sudo
usermod -aG docker ubuntu

echo "[1/7] Packages installed ✓"

# ── 2. Swap (critical — prevents OOM during docker builds on ARM) ─────────────
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "[2/7] 4 GB swap created ✓"
else
  echo "[2/7] Swap already configured ✓"
fi

# ── 3. OS firewall — iptables (Oracle Ubuntu images ship restrictive by default) ──
# Oracle uses TWO firewall layers:
#   Layer 1: VCN Security List (you must add rules in the Oracle Console — see note at end)
#   Layer 2: OS iptables (configured here)
# Both must allow traffic; Oracle's Ubuntu image ships with restrictive iptables.

iptables -I INPUT 1 -p tcp --dport 22 -m state --state NEW -j ACCEPT
iptables -I INPUT 2 -p tcp --dport 80 -m state --state NEW -j ACCEPT
iptables -I INPUT 3 -p tcp --dport 443 -m state --state NEW -j ACCEPT
# Allow internal VCN traffic (10.0.0.0/16)
iptables -I INPUT 4 -s 10.0.0.0/16 -j ACCEPT
# Save rules so they persist across reboots
netfilter-persistent save

echo "[3/7] iptables rules saved ✓"

# ── 4. Anti-idle cron (Oracle reclaims free-tier instances below ~15% avg CPU) ─
CRON_CMD="*/5 * * * * dd if=/dev/zero bs=1M count=100 of=/dev/null 2>/dev/null"
(crontab -u ubuntu -l 2>/dev/null || true; echo "$CRON_CMD") | crontab -u ubuntu -
echo "[4/7] Anti-idle cron installed ✓"

# ── 5. Clone repo ─────────────────────────────────────────────────────────────
if [[ ! -d "$REPO_DIR/.git" ]]; then
  git clone "$REPO_URL" "$REPO_DIR"
  echo "[5/7] Repo cloned to $REPO_DIR ✓"
else
  echo "[5/7] Repo already cloned ✓"
fi

# ── 6. Environment file ───────────────────────────────────────────────────────
if [[ ! -f "$API_DIR/.env.production" ]]; then
  cp "$API_DIR/.env.production.template" "$API_DIR/.env.production"
  echo ""
  echo "  ┌──────────────────────────────────────────────┐"
  echo "  │  ACTION REQUIRED: fill in .env.production     │"
  echo "  │  nano $API_DIR/.env.production                │"
  echo "  └──────────────────────────────────────────────┘"
  echo ""
fi
echo "[6/7] .env.production ready ✓"

# ── 7. Caddy config ───────────────────────────────────────────────────────────
if [[ -n "$DOMAIN" ]]; then
  cp "$(dirname "$0")/Caddyfile" /etc/caddy/Caddyfile
  sed -i "s/YOUR_DOMAIN/$DOMAIN/g" /etc/caddy/Caddyfile
  systemctl reload caddy
  echo "[7/7] Caddy configured for $DOMAIN ✓"
else
  echo "[7/7] SKIPPED — set DOMAIN variable at top of script then re-run"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Setup complete. Next steps:"
echo ""
echo " 1. ORACLE CONSOLE (must do manually):"
echo "    Networking > VCNs > your-vcn > Security Lists > Default"
echo "    Add Ingress Rules:"
echo "      TCP 22 from 0.0.0.0/0  (SSH)"
echo "      TCP 80 from 0.0.0.0/0  (HTTP)"
echo "      TCP 443 from 0.0.0.0/0 (HTTPS)"
echo "    If instance has a Network Security Group (NSG):"
echo "      Add the SAME rules there too — NSG silently drops traffic"
echo ""
echo " 2. Fill in secrets:"
echo "    nano $API_DIR/.env.production"
echo ""
echo " 3. Point DNS A record to this server's public IP"
echo "    Then set DOMAIN= in this script and re-run, OR manually:"
echo "    edit /etc/caddy/Caddyfile and run: systemctl reload caddy"
echo ""
echo " 4. Build and start the API:"
echo "    cd $REPO_DIR && bash deploy/deploy.sh"
echo ""
echo " 5. Verify:"
echo "    curl https://$DOMAIN/health"
echo "════════════════════════════════════════"
