# Firma y distribución

Estado: **los instaladores de v1 salen SIN firmar**. Esto es lo que pasa y lo que
costaría arreglarlo.

## Qué ocurre sin firmar

### macOS (Gatekeeper)

Al abrir la app descargada, macOS dice que **no se puede verificar el
desarrollador**. Consecuencias y salidas:

1. **Clic derecho → Abrir** una vez: queda autorizada para siempre.
2. O `Ajustes → Privacidad y seguridad → «Abrir de todos modos»`.
3. Por terminal: `xattr -dr com.apple.quarantine "/Applications/animacion-dev Studio.app"`.

En equipos gestionados (MDM) puede estar directamente bloqueado y requerir
excepción del administrador.

**Nota:** los binarios sidecar (chrome-headless-shell, ffmpeg) heredan el mismo
trato. El `entitlements` del proyecto ya incluye lo necesario
(`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`)
para poder lanzarlos con *hardened runtime*.

### Windows (SmartScreen)

Al ejecutar el instalador aparece **«Windows protegió tu PC»**. Salidas:

1. **Más información → Ejecutar de todas formas**.
2. El aviso se repite hasta que el binario acumula **reputación** (descargas) o
   está firmado.

Un `.msi`/`.exe` sin firmar y poco descargado siempre dispara el aviso.

## Cómo evitarlo (y qué cuesta)

| Vía | Coste aproximado | Quita… |
|---|---|---|
| **Apple Developer Program** (certificado *Developer ID*) | 99 $/año | Gatekeeper. Requiere **notarizar** (subir el binario a Apple). |
| **Certificado OV** (Windows, p. ej. Sectigo/DigiCert) | 200–400 $/año | SmartScreen tras ganar reputación (semanas). |
| **Certificado EV** (Windows) | 300–600 $/año + token HSM | SmartScreen **desde el primer día**. |
| **Azure Trusted Signing** | ~10 $/mes | Ambos (Windows), con verificación de identidad. |

En macOS, firmar + notarizar se hace con `notarize` de `@electron/notarize`
añadiendo al `electron-builder.yml`:

```yaml
mac:
  notarize: true
```

y las variables `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID` en CI.

En Windows, `electron-builder` firma con `certificateFile` + `certificatePassword`
(o con un token EV / Trusted Signing). En CI se pasan como secretos.

## Recomendación para v1

No firmar todavía. La editora abre la app **una vez** con clic derecho → Abrir (o
«Más información → Ejecutar de todas formas» en Windows) y a partir de ahí es
transparente. Vale la pena firmar cuando la app se distribuya a más gente (el
perjuicio de SmartScreen crece con usuarios que no conocen el origen).

## Actualizaciones

Fuera de alcance en v1: se instala el instalador nuevo a mano. El diseño ya está
preparado (todo el estado vive en `userData`, separado del binario), así que
añadir `electron-updater` más adelante no requiere mover datos.

## Compatibilidad objetivo

| Sistema | Objetivo | Notas |
|---|---|---|
| macOS | arm64, 14+ (actual −1) | x64 viable: ver más abajo. |
| Windows | 11 x64 | Windows 10 debería funcionar; no verificado. |
| Linux | No soportado | El código es portable, pero no se distribuye. |

### Añadir macOS x64

```bash
CHROME_PLATFORM=mac_arm,mac KEEP_PLATFORMS=darwin/arm64,darwin/x64 npm run sidecars
# añadir "x64" a mac.target[0].arch en electron-builder.yml
npx electron-builder --mac --arm64 --x64
```

Ojo: eso mete **dos** navegadores y dos ffprobe en el instalador (≈ +230 MB). La
app elige el binario de su arquitectura automáticamente.
