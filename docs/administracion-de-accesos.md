# Administración de accesos

Los administradores mantienen `role: admin`, con `adminAccess: owner`, `full` o `restricted`. Los permisos disponibles se definen en `backend/src/config/admin-permissions.json`. El backend comprueba el perfil persistido en cada solicitud y verifica tokens revocados. Las cuentas administrativas antiguas sin nivel definido no reciben acceso completo automáticamente: el propietario debe configurarlas.

El catálogo vive dentro de `backend` para ser compatible con el `rootDir` actual de Render; el frontend importa ese mismo archivo. Render no incluye archivos externos al directorio raíz del servicio ([documentación oficial](https://render.com/docs/monorepo-support)).

## Configurar al propietario

Antes de habilitar esta versión, configura al propietario y asigna permisos a los administradores existentes. Las cuentas antiguas sin permisos no podrán gestionar el sistema hasta que el propietario configure su acceso.

Desde la carpeta `backend`, con las credenciales Firebase del entorno configuradas:

```text
npm run admin:owner -- --username owner --name "Propietario"
```

El comando solicita la contraseña sin mostrarla; no la acepta por argumentos, no la guarda en el repositorio y no configura contraseñas predeterminadas. El nombre `owner` es un ejemplo configurable. No es necesario tener un buzón de correo: internamente Firebase utiliza el identificador reservado `usuario@admin.nexoperfil.invalid`. La aplicación permite iniciar sesión directamente con el nombre de usuario.

La primera configuración reserva al propietario de manera transaccional en `adminSecurity/owner`. No existe un endpoint público para reclamar esa cuenta. Las cuentas de empresa no pueden registrarse con el dominio administrativo reservado. El propietario no se puede eliminar, suspender ni convertir en otra clase de cuenta desde la API.

Si se pierde la contraseña del propietario, un operador con acceso al servidor puede ejecutar:

```text
npm run admin:owner -- --username owner --reset-password
```

El comando verifica que el usuario corresponde al propietario ya configurado, solicita una nueva contraseña y revoca sesiones. No crea otro propietario.

## Crear y gestionar cuentas

La sección **Accesos y usuarios** permite crear administradores completos o restringidos, cambiar permisos, suspender o reactivar cuentas, restablecer contraseñas y eliminar accesos. Al crear una cuenta se genera una contraseña aleatoria, devuelta una sola vez al creador. Debe entregarse por un canal privado; no se envían mensajes ni correos automáticamente. El usuario puede cambiar su propia contraseña desde **Mi contraseña**, proporcionando la actual.

Una cuenta restringida no puede crear administradores completos ni conceder permisos que ella no tenga. Tampoco puede modificar, recuperar o eliminar administradores con mayores privilegios. No se permiten modificaciones destructivas sobre la propia cuenta desde el panel de gestión.

La eliminación requiere el identificador de la cuenta, elimina la identidad de Firebase y conserva un registro de auditoría y un perfil marcado como eliminado. No elimina empresas, procesos, candidatos de evaluaciones ni respuestas. Si el proveedor falla durante la eliminación, el perfil queda bloqueado como `deletion_pending`; se puede reintentar desde el panel. Los cambios llevan revisión para evitar sobreescribir ediciones simultáneas. Las contraseñas nunca se almacenan en perfiles o auditorías.

La recuperación por correo solo aplica a cuentas con correo real. Las cuentas administrativas de usuario interno se recuperan mediante otro administrador autorizado o, para el propietario, con el comando del servidor.
