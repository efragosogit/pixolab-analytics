/**
 * One-time interactive script to get a Google Ads API refresh token.
 *
 * Run with the OAuth client credentials loaded from .env.local:
 *
 *   node --env-file=.env.local scripts/get-google-ads-refresh-token.mjs
 *
 * It opens a local server on http://localhost:3456, prints an
 * authorization URL, and waits for you to open it and approve access with
 * the Google account that manages the Ads MCC account. Google redirects
 * back to localhost with a code, which this script exchanges for a
 * refresh token and prints — paste that into .env.local as
 * GOOGLE_ADS_REFRESH_TOKEN and you're done, this script isn't needed again
 * unless the refresh token gets revoked.
 */
import { google } from "googleapis";
import http from "node:http";

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET — make sure .env.local has them and you ran this with --env-file=.env.local",
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // forces a refresh_token even if this account authorized before
  scope: ["https://www.googleapis.com/auth/adwords"],
});

console.log("\n1. Abre esta URL en tu navegador, con la cuenta de Google que administra Ads:\n");
console.log(authUrl);
console.log("\n2. Autoriza. Tu navegador va a redirigir a localhost — este script lo captura solo.\n");
console.log(`Esperando en ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.end(`Google devolvió un error: ${error}. Revisa la terminal.`);
    console.error(`\n❌ Google devolvió un error: ${error}\n`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.end("No llegó ningún código en la URL. Revisa la terminal.");
    return;
  }

  res.end("Listo — ya puedes cerrar esta pestaña y volver a la terminal.");
  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.error(
        "\n⚠️  Google no devolvió un refresh_token. Esto pasa si esta cuenta ya había autorizado esta app antes " +
          "sin 'prompt=consent'. Ve a myaccount.google.com/permissions, quita el acceso de esta app, y corre " +
          "el script de nuevo.\n",
      );
      process.exit(1);
    }
    console.log("\n✅ Refresh token:\n");
    console.log(tokens.refresh_token);
    console.log("\nGuárdalo en .env.local como GOOGLE_ADS_REFRESH_TOKEN\n");
  } catch (e) {
    console.error("\n❌ Error obteniendo el token:", e instanceof Error ? e.message : e, "\n");
  }
  process.exit(0);
});

server.listen(PORT);
