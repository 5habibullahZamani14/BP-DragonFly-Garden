# 02 - RASPBERRY PI SETUP

Use the following guides in order to prepare a Raspberry Pi for the restaurant system:

1. [02.1-OS_INSTALLATION.md](02.1-OS_INSTALLATION.md) - install Raspberry Pi OS.
2. Install Git and a 64-bit ARM Linux build of Node.js 20 or newer. Use the current
   instructions/downloads at [nodejs.org](https://nodejs.org/); do not assume the OS
   package repository's Node.js version is new enough. Verify:

   ```bash
   node --version
   npm --version
   sudo apt update
   sudo apt install -y git
   git --version
   ```

3. Clone the repository and build from its lockfiles:

   ```bash
   cd "$HOME"
   git clone https://github.com/5habibullahZamani14/BP-DragonFly-Garden.git
   cd "$HOME/BP-DragonFly-Garden/restaurant-system/backend"
   npm ci
   cd "$HOME/BP-DragonFly-Garden/frontend"
   npm ci
   npm run build
   ```

   If the folder already exists, inspect `git status --short` and do not overwrite local
   work by cloning or replacing it.
4. Create the Pi's private backend configuration:

   ```bash
   cd "$HOME/BP-DragonFly-Garden/restaurant-system/backend"
   cp .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   nano .env
   ```

   Paste the generated random value as `JWT_SECRET` in `.env`, save the file, and keep it
   private. Leave optional integrations blank unless configured. `.env.local`, if present,
   overrides `.env`. Do not copy another computer's environment file without reviewing
   every setting. For the Windows-specific setup, see
   [03.3-ENVIRONMENT_CONFIG.md](03.3-ENVIRONMENT_CONFIG.md).
5. [02.2-NETWORK_HOTSPOT.md](02.2-NETWORK_HOTSPOT.md) - optionally configure a local
   Wi-Fi hotspot. The example uses `10.42.0.1`; this is not guaranteed on other network
   configurations.
6. [02.3-PRINTER_SETUP.md](02.3-PRINTER_SETUP.md) - add and test a CUPS queue.
7. [02.4-SYSTEMD_SERVICES.md](02.4-SYSTEMD_SERVICES.md) - configure service startup using
   the actual Linux username and paths on this Pi.
8. [05.1-BACKUP_PROCEDURES.md](05.1-BACKUP_PROCEDURES.md) - configure and verify a backup.

The system listens on port `5000` by default. Use `http://10.42.0.1:5000` only when the
hotspot is configured with that address; otherwise use the Pi's actual reachable address.
Starting systemd does not guarantee that the hotspot, application health, or printer is
working. Verify each separately before service.
