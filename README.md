# SDS_ENC_PY — Encuesta Diagnóstico Sudameris Seguros

Repositorio estático para Vercel.

## Archivos requeridos

- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `data.json`

## Configuración

`config.js` debe apuntar a la Web App de Apps Script:

```js
window.CONFIG = {
  ENDPOINT_URL: "https://script.google.com/macros/s/AKfycbzMkmGGvF6glooVb5L2mj_sArem5CbE9NjYlwj0ZrlKvLJgokEPdRRp5jNr3WOAqMYU/exec"
};
```

## Importante

El archivo de encuesta debe llamarse exactamente:

```txt
data.json
```

No `data.js`.

## Backend

El backend está en Google Apps Script y escribe en la hoja `Respuestas` del Google Sheet de Sudameris.
