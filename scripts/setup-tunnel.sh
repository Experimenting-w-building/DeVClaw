#!/bin/bash
set -euo pipefail

# OpenClaw AI -- Cloudflare Tunnel Setup
#
# This script sets up a Cloudflare Tunnel to expose your dashboard
# to the internet so you can access it from anywhere.
#
# Prerequisites:
#   - A Cloudflare account (free)
#   - A domain managed by Cloudflare (or use a *.cfargotunnel.com subdomain)
#
# Usage:
#   ./scripts/setup-tunnel.sh

DASHBOARD_PORT="${DASHBOARD_PORT:-3000}"

echo "OpenClaw AI -- Cloudflare Tunnel Setup"
echo "======================================="
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
  echo "cloudflared not found. Installing via Homebrew..."
  if command -v brew &> /dev/null; then
    brew install cloudflared
  else
    echo "Please install cloudflared manually:"
    echo "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
  fi
fi

echo "cloudflared version: $(cloudflared --version)"
echo ""

# Check if already logged in
if ! cloudflared tunnel list &> /dev/null 2>&1; then
  echo "Logging in to Cloudflare..."
  cloudflared tunnel login
  echo ""
fi

TUNNEL_NAME="openclaw-dashboard"

# Check if tunnel already exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
  echo "Tunnel '$TUNNEL_NAME' already exists."
else
  echo "Creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
fi

echo ""
echo "To route a domain to your dashboard, run:"
echo ""
echo "  cloudflared tunnel route dns $TUNNEL_NAME dashboard.yourdomain.com"
echo ""
echo "Then start the tunnel with:"
echo ""
echo "  cloudflared tunnel --url http://localhost:$DASHBOARD_PORT run $TUNNEL_NAME"
echo ""
echo "Or for a quick test without a custom domain:"
echo ""
echo "  cloudflared tunnel --url http://localhost:$DASHBOARD_PORT"
echo ""
echo "This gives you a temporary *.trycloudflare.com URL."
echo ""
echo "To run the tunnel as a background service on macOS:"
echo ""
echo "  sudo cloudflared service install"
echo "  sudo launchctl start com.cloudflare.cloudflared"
echo ""
echo "Done! Your dashboard will be accessible at your configured domain"
echo "with password authentication (set DASHBOARD_PASSWORD in .env)."
