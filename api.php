<?php
ob_start();
ini_set('display_errors', '0');
error_reporting(E_ALL);

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        ob_clean();
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Error interno: ' . $err['message']], JSON_UNESCAPED_UNICODE);
    } else {
        ob_end_flush();
    }
});


header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Configuración BD ──
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'te_cuido');  
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');

// ═══ HELPERS GLOBALES ════ // 

function conectar(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec("SET time_zone = '-05:00'");  // UTC-5 Colombia
    }
    return $pdo;
}

function responder(int $codigo, array $datos): never {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Genera un token seguro y lo guarda en sesion */
function generarToken(int $idUsuario): string {
    $pdo   = conectar();
    $token = bin2hex(random_bytes(32));
    $exp   = date('Y-m-d H:i:s', strtotime('+8 hours'));
    $ip    = $_SERVER['REMOTE_ADDR'] ?? null;

    $pdo->prepare('DELETE FROM sesion WHERE id_usuario = ? AND expiracion < NOW()')
        ->execute([$idUsuario]);

    $pdo->prepare('INSERT INTO sesion (id_usuario, token, expiracion, ip) VALUES (?,?,?,?)')
        ->execute([$idUsuario, $token, $exp, $ip]);

    return $token;
}

/** Valida el token del header Authorization: Bearer <token>
 *  Retorna el array del usuario autenticado o responde 401. */
function autenticar(): array {
    $pdo  = conectar();
    // Apache/XAMPP bloquea HTTP_AUTHORIZATION — múltiples fallbacks
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$auth) $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$auth) $auth = $_SERVER['HTTP_X_AUTHORIZATION'] ?? '';
    if (!$auth && function_exists('apache_request_headers')) {
        $h    = apache_request_headers();
        $auth = $h['Authorization'] ?? $h['authorization'] ?? $h['HTTP_AUTHORIZATION'] ?? '';
    }
    // Fallback final: token enviado en el body del JSON como _token
    if (!$auth) {
        global $body;
        if (!empty($body['_token'])) {
            $auth = 'Bearer ' . $body['_token'];
        }
    }

    if (!preg_match('/^Bearer\s+(\S+)$/', $auth, $m)) {
        responder(401, ['error' => 'Token requerido.']);
    }

    $stmt = $pdo->prepare(
        'SELECT u.* FROM sesion s
         JOIN usuarios u ON u.id = s.id_usuario
         WHERE s.token = ? AND s.expiracion > NOW() AND u.activo = 1'
    );
    $stmt->execute([$m[1]]);
    $usuario = $stmt->fetch();

    if (!$usuario) {
        responder(401, ['error' => 'Sesión inválida o expirada.']);
    }

    unset($usuario['contrasena']);
    return $usuario;
}

/** Obtiene id_paciente a partir del usuario autenticado (rol paciente) */
function getPacienteId(array $usuario): int {
    if ($usuario['rol'] !== 'paciente') {
        responder(403, ['error' => 'Solo pacientes pueden realizar esta acción.']);
    }
    $pdo  = conectar();
    $stmt = $pdo->prepare('SELECT id_paciente FROM paciente WHERE id_usuario = ?');
    $stmt->execute([$usuario['id']]);
    $row  = $stmt->fetch();
    if (!$row) {
        responder(404, ['error' => 'Perfil de paciente no encontrado.']);
    }
    return (int) $row['id_paciente'];
}

// ═════  LECTURA DEL BODY Y DISPATCH ═════// 

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$accion = trim($body['accion'] ?? '');

switch ($accion) {

// ═══ MÓDULO AUTH ════ // 

    // ── REGISTRO ──────────────────────────────────────────────
    case 'registro':
        $pdo = conectar();

        $requeridos = ['nombres', 'apellidos', 'correo', 'cedula', 'contrasena', 'rol'];
        foreach ($requeridos as $campo) {
            if (empty(trim($body[$campo] ?? ''))) {
                responder(400, ['error' => "El campo '$campo' es obligatorio."]);
            }
        }

        $correo = strtolower(trim($body['correo']));
        $cedula = trim($body['cedula']);

        if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
            responder(400, ['error' => 'El correo no tiene un formato válido.']);
        }
        if (strlen($body['contrasena']) < 8) {
            responder(400, ['error' => 'La contraseña debe tener al menos 8 caracteres.']);
        }

        $rolesPermitidos = ['paciente', 'familiar', 'eps'];
        if (!in_array($body['rol'], $rolesPermitidos, true)) {
            responder(400, ['error' => 'Rol no válido.']);
        }

        $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE correo = ? OR cedula = ?');
        $stmt->execute([$correo, $cedula]);
        if ($stmt->fetch()) {
            responder(409, ['error' => 'Ya existe una cuenta con ese correo o cédula.']);
        }

        $hash   = password_hash($body['contrasena'], PASSWORD_DEFAULT);
        $idEps  = !empty($body['id_eps']) ? (int)$body['id_eps'] : null;
        $sexo   = in_array($body['sexo'] ?? '', ['M','F'], true) ? $body['sexo'] : null;

        $pdo->prepare(
            'INSERT INTO usuarios (nombres, apellidos, correo, cedula, contrasena, rol, id_eps, sexo)
             VALUES (?,?,?,?,?,?,?,?)'
        )->execute([
            trim($body['nombres']),
            trim($body['apellidos']),
            $correo,
            $cedula,
            $hash,
            $body['rol'],
            $idEps,
            $sexo,
        ]);

        $nuevoId = (int) $pdo->lastInsertId();

        // Si el rol es familiar, crear vínculo en tabla familiar
        if ($body['rol'] === 'familiar') {
            $codigoPaciente = trim($body['codigo_paciente'] ?? '');
            if ($codigoPaciente !== '') {
                // Buscar paciente por código (usamos id directamente o TC-XXXXX)
                $idPacienteBuscado = (int) preg_replace('/[^0-9]/', '', $codigoPaciente);
                $stmtPac = $pdo->prepare(
                    'SELECT p.id_paciente FROM paciente p
                     JOIN usuarios u ON u.id = p.id_usuario
                     WHERE p.id_paciente = ? AND u.activo = 1'
                );
                $stmtPac->execute([$idPacienteBuscado]);
                $pacRow = $stmtPac->fetch();
                if ($pacRow) {
                    $pdo->prepare(
                        'INSERT INTO familiar (id_usuario, id_paciente, parentesco)
                         VALUES (?, ?, ?)'
                    )->execute([
                        $nuevoId,
                        $pacRow['id_paciente'],
                        trim($body['parentesco'] ?? 'familiar'),
                    ]);
                }
            }
        }

        // Si el rol es paciente, crear perfil clínico automáticamente
        if ($body['rol'] === 'paciente') {
            $pdo->prepare(
                'INSERT INTO paciente (id_usuario, fecha_nacimiento, telefono, direccion, id_eps)
                 VALUES (?,?,?,?,?)'
            )->execute([
                $nuevoId,
                $body['fecha_nacimiento'] ?? null,
                trim($body['telefono'] ?? ''),
                trim($body['direccion'] ?? ''),
                $idEps,
            ]);

            $idPaciente = (int) $pdo->lastInsertId();

            // Guardar enfermedades seleccionadas
            $enfermedades = $body['enfermedades'] ?? [];
            if (is_array($enfermedades) && !empty($enfermedades)) {
                $stmtEnf = $pdo->prepare(
                    'INSERT IGNORE INTO paciente_enfermedad (id_paciente, id_enfermedad) VALUES (?,?)'
                );
                foreach ($enfermedades as $idEnf) {
                    $idEnf = (int) $idEnf;
                    if ($idEnf > 0) $stmtEnf->execute([$idPaciente, $idEnf]);
                }
            }

            // Guardar condición personalizada en diagnostico
            $otras = trim($body['otras_enfermedades'] ?? '');
            if ($otras !== '') {
                $pdo->prepare(
                    'INSERT INTO diagnostico (id_paciente, descripcion, fecha_diagnostico) VALUES (?, ?, CURDATE())'
                )->execute([$idPaciente, 'Otras condiciones al registro: ' . $otras]);
            }
        }

        $stmt = $pdo->prepare(
            'SELECT id, nombres, apellidos, correo, cedula, rol, sexo, fecha_registro FROM usuarios WHERE id = ?'
        );
        $stmt->execute([$nuevoId]);

        responder(201, [
            'ok'      => true,
            'mensaje' => 'Registro exitoso',
            'usuario' => $stmt->fetch(),
            'token'   => generarToken($nuevoId),
        ]);

    // ── LOGIN ─────────────────────────────────────────────────

    case 'login':
        $pdo = conectar();

        if (empty($body['correo']) || empty($body['contrasena'])) {
            responder(400, ['error' => 'Correo y contraseña son requeridos.']);
        }

        $correo = strtolower(trim($body['correo']));
        $stmt   = $pdo->prepare('SELECT * FROM usuarios WHERE correo = ? AND activo = 1');
        $stmt->execute([$correo]);
        $usuario = $stmt->fetch();

        if (!$usuario || !password_verify($body['contrasena'], $usuario['contrasena'])) {
            responder(401, ['error' => 'Correo o contraseña incorrectos.']);
        }

        unset($usuario['contrasena']);

        responder(200, [
            'ok'      => true,
            'usuario' => $usuario,
            'token'   => generarToken($usuario['id']),
        ]);

    // ── LOGOUT ────────────────────────────────────────────────

    case 'logout':
        // Múltiples fallbacks para obtener el token
        $authLo = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!$authLo) $authLo = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!$authLo && function_exists('apache_request_headers')) {
            $hLo    = apache_request_headers();
            $authLo = $hLo['Authorization'] ?? $hLo['authorization'] ?? '';
        }
        // Fallback: token enviado en el body JSON como _token (igual que autenticar())
        if (!$authLo && !empty($body['_token'])) {
            $authLo = 'Bearer ' . $body['_token'];
        }
        if (preg_match('/^Bearer\s+(\S+)$/', $authLo, $m)) {
            conectar()->prepare('DELETE FROM sesion WHERE token = ?')->execute([$m[1]]);
        }
        responder(200, ['ok' => true, 'mensaje' => 'Sesión cerrada.']);

// ═════ MÓDULO PERFIL DE PACIENTE ═════// 

    // ── VER PERFIL ────────────────────────────────────────────
    case 'perfil':
        $usuario   = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo       = conectar();

        $stmt = $pdo->prepare(
            'SELECT u.nombres, u.apellidos, u.correo, u.cedula, u.sexo,
                    p.fecha_nacimiento, p.telefono, p.direccion,
                    e.nombre_eps
             FROM paciente p
             JOIN usuarios u ON u.id = p.id_usuario
             LEFT JOIN eps e ON e.id_eps = p.id_eps
             WHERE p.id_paciente = ?'
        );
        $stmt->execute([$idPaciente]);

        responder(200, ['ok' => true, 'perfil' => $stmt->fetch()]);

    // ── ACTUALIZAR PERFIL ─────────────────────────────────────

    case 'actualizar_perfil':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        $pdo->prepare(
            'UPDATE paciente SET telefono=?, direccion=? WHERE id_paciente=?'
        )->execute([
            trim($body['telefono'] ?? ''),
            trim($body['direccion'] ?? ''),
            $idPaciente,
        ]);

        responder(200, ['ok' => true, 'mensaje' => 'Perfil actualizado.']);

// ══════ MÓDULO SIGNOS VITALES ═════ // 

    // ── REGISTRAR SIGNO VITAL ─────────────────────────────────
    case 'registrar_signo':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        if (empty($body['id_parametro']) || !isset($body['valor'])) {
            responder(400, ['error' => 'id_parametro y valor son requeridos.']);
        }

        $idParametro = (int) $body['id_parametro'];
        $valor       = (float) $body['valor'];

        // Buscar rango: primero personalizado, luego global como fallback
        $stmt = $pdo->prepare(
            'SELECT t.nombre_parametro,
                    COALESCE(rp.rango_min, t.rango_min) AS rango_min,
                    COALESCE(rp.rango_max, t.rango_max) AS rango_max,
                    COALESCE(rp.fuente,   "global")     AS rango_fuente
             FROM tipo_parametro t
             LEFT JOIN rango_paciente rp
                    ON rp.id_parametro = t.id_parametro
                   AND rp.id_paciente  = ?
             WHERE t.id_parametro = ?'
        );
        $stmt->execute([$idPaciente, $idParametro]);
        $param  = $stmt->fetch();
        $alerta = 0;

        if ($param && $param['rango_min'] !== null && $param['rango_max'] !== null) {
            if ($valor < (float)$param['rango_min'] || $valor > (float)$param['rango_max']) {
                $alerta = 1;
            }
        }

        $pdo->prepare(
            'INSERT INTO registro_salud (id_paciente, id_parametro, valor, observacion, alerta)
             VALUES (?,?,?,?,?)'
        )->execute([
            $idPaciente,
            $idParametro,
            $valor,
            trim($body['observacion'] ?? ''),
            $alerta,
        ]);

        $idRegistro = (int) $pdo->lastInsertId();

        // Si hay alerta, crear notificación automática
        if ($alerta) {
            $rangoFuente = $param['rango_fuente'] === 'global' ? 'referencia general' : 'tu rango personalizado';
            $pdo->prepare(
                'INSERT INTO notificacion (id_usuario, tipo, titulo, cuerpo)
                 VALUES (?, "alerta_salud", "Alerta de salud", ?)'
            )->execute([
                $usuario['id'],
                "Tu registro de '{$param['nombre_parametro']}' está fuera de {$rangoFuente} ({$param['rango_min']} – {$param['rango_max']}).",
            ]);
        }

        responder(201, [
            'ok'           => true,
            'mensaje'      => 'Signo vital registrado.',
            'alerta'       => (bool) $alerta,
            'rango_fuente' => $param['rango_fuente'] ?? 'global',
            'id'           => $idRegistro,
        ]);

    // ── HISTORIAL DE SIGNOS VITALES ───────────────────────────
    case 'historial_signos':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        $limite = min((int)($body['limite'] ?? 20), 100);

        // Incluye el rango efectivo por paciente (personalizado > global)
        
        $stmt = $pdo->prepare(
            'SELECT r.id_registro, r.id_parametro, r.valor, r.observacion, r.alerta, r.fecha,
                    t.nombre_parametro, t.unidad,
                    COALESCE(rp.rango_min, t.rango_min) AS rango_min,
                    COALESCE(rp.rango_max, t.rango_max) AS rango_max,
                    COALESCE(rp.fuente,   "global")     AS rango_fuente
             FROM registro_salud r
             JOIN tipo_parametro t ON t.id_parametro = r.id_parametro
             LEFT JOIN rango_paciente rp
                    ON rp.id_parametro = r.id_parametro
                   AND rp.id_paciente  = r.id_paciente
             WHERE r.id_paciente = ?
             ORDER BY r.fecha DESC
             LIMIT ?'
        );
        $stmt->bindValue(1, (int)$idPaciente, PDO::PARAM_INT);
        $stmt->bindValue(2, $limite,          PDO::PARAM_INT);
        $stmt->execute();

        responder(200, ['ok' => true, 'registros' => $stmt->fetchAll()]);

    // ── TIPOS DE PARÁMETROS DISPONIBLES ──────────────────────
    
    case 'parametros':
        $usuario    = autenticar();
        $pdo        = conectar();

        // Si el usuario es paciente, se busca sus rangos personalizados
        $idPaciente = null;
        if ($usuario['rol'] === 'paciente') {
            $stmtP = $pdo->prepare('SELECT id_paciente FROM paciente WHERE id_usuario = ?');
            $stmtP->execute([$usuario['id']]);
            $rowP = $stmtP->fetch();
            if ($rowP) $idPaciente = (int) $rowP['id_paciente'];
        }

        if ($idPaciente) {
            // LEFT JOIN con rango_paciente: si existe se usa el personalizado,
            // si no existe usa el global de tipo_parametro
            $stmt = $pdo->prepare(
                'SELECT t.*,
                        COALESCE(rp.rango_min, t.rango_min)  AS rango_min,
                        COALESCE(rp.rango_max, t.rango_max)  AS rango_max,
                        COALESCE(rp.fuente,    "global")     AS rango_fuente,
                        (rp.id_paciente IS NOT NULL)         AS rango_personalizado
                 FROM tipo_parametro t
                 LEFT JOIN rango_paciente rp
                        ON rp.id_parametro = t.id_parametro
                       AND rp.id_paciente  = ?
                 ORDER BY t.nombre_parametro'
            );
            $stmt->execute([$idPaciente]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT *, "global" AS rango_fuente, 0 AS rango_personalizado
                 FROM tipo_parametro ORDER BY nombre_parametro'
            );
            $stmt->execute();
        }

        responder(200, ['ok' => true, 'parametros' => $stmt->fetchAll()]);

    // ── EDITAR SIGNO VITAL ────────────────────────────────────
    case 'editar_signo':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        if (empty($body['id_registro']) || !isset($body['valor'])) {
            responder(400, ['error' => 'id_registro y valor son requeridos.']);
        }

        $idRegistro = (int) $body['id_registro'];
        $valor      = (float) $body['valor'];

        // Verificar que el registro pertenece al paciente y obtener id_parametro
        $stmt = $pdo->prepare(
            'SELECT r.id_parametro, t.nombre_parametro,
                    COALESCE(rp.rango_min, t.rango_min) AS rango_min,
                    COALESCE(rp.rango_max, t.rango_max) AS rango_max,
                    COALESCE(rp.fuente,   "global")     AS rango_fuente
             FROM registro_salud r
             JOIN tipo_parametro t ON t.id_parametro = r.id_parametro
             LEFT JOIN rango_paciente rp
                    ON rp.id_parametro = r.id_parametro
                   AND rp.id_paciente  = r.id_paciente
             WHERE r.id_registro = ? AND r.id_paciente = ?'
        );
        $stmt->execute([$idRegistro, $idPaciente]);
        $param = $stmt->fetch();

        if (!$param) {
            responder(404, ['error' => 'Registro no encontrado.']);
        }

        $alerta = 0;
        if ($param['rango_min'] !== null && $param['rango_max'] !== null) {
            if ($valor < (float)$param['rango_min'] || $valor > (float)$param['rango_max']) {
                $alerta = 1;
            }
        }

        $pdo->prepare(
            'UPDATE registro_salud SET valor=?, observacion=?, alerta=? WHERE id_registro=? AND id_paciente=?'
        )->execute([
            $valor,
            trim($body['observacion'] ?? ''),
            $alerta,
            $idRegistro,
            $idPaciente,
        ]);

        responder(200, [
            'ok'           => true,
            'mensaje'      => 'Registro actualizado.',
            'alerta'       => (bool) $alerta,
            'rango_fuente' => $param['rango_fuente'] ?? 'global',
        ]);

    // ── ELIMINAR SIGNO VITAL ──────────────────────────────────
    case 'eliminar_signo':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        if (empty($body['id_registro'])) {
            responder(400, ['error' => 'id_registro es requerido.']);
        }

        $stmt = $pdo->prepare(
            'DELETE FROM registro_salud WHERE id_registro = ? AND id_paciente = ?'
        );
        $stmt->execute([(int)$body['id_registro'], $idPaciente]);

        if ($stmt->rowCount() === 0) {
            responder(404, ['error' => 'Registro no encontrado.']);
        }

        responder(200, ['ok' => true, 'mensaje' => 'Registro eliminado.']);



    // ── AGENDAR CITA ──────────────────────────────────────────
    case 'agendar_cita':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        if (empty($body['fecha']) || empty($body['hora'])) {
            responder(400, ['error' => 'Fecha y hora son requeridas.']);
        }

        $pdo->prepare(
            'INSERT INTO cita_medica (id_paciente, fecha, hora, motivo, estado)
             VALUES (?,?,?,?,"pendiente")'
        )->execute([
            $idPaciente,
            $body['fecha'],
            $body['hora'],
            trim($body['motivo'] ?? ''),
        ]);

        $idCita = (int) $pdo->lastInsertId();

        // Notificación de recordatorio
        $pdo->prepare(
            'INSERT INTO notificacion (id_usuario, tipo, titulo, cuerpo)
             VALUES (?, "cita", "Cita agendada", ?)'
        )->execute([
            $usuario['id'],
            "Tienes una cita el {$body['fecha']} a las {$body['hora']}.",
        ]);

        responder(201, ['ok' => true, 'mensaje' => 'Cita agendada.', 'id_cita' => $idCita]);

    // ── LISTAR CITAS ──────────────────────────────────────────
    case 'mis_citas':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);

        $stmt = conectar()->prepare(
            'SELECT * FROM cita_medica WHERE id_paciente = ? ORDER BY fecha DESC, hora DESC'
        );
        $stmt->execute([$idPaciente]);

        responder(200, ['ok' => true, 'citas' => $stmt->fetchAll()]);

    // ── CANCELAR CITA ─────────────────────────────────────────
    case 'cancelar_cita':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        if (empty($body['id_cita'])) {
            responder(400, ['error' => 'id_cita es requerido.']);
        }

        $stmt = $pdo->prepare(
            "UPDATE cita_medica SET estado='cancelada'
             WHERE id_cita = ? AND id_paciente = ? AND estado = 'pendiente'"
        );
        $stmt->execute([(int)$body['id_cita'], $idPaciente]);

        if ($stmt->rowCount() === 0) {
            responder(404, ['error' => 'Cita no encontrada o ya no es cancelable.']);
        }

        responder(200, ['ok' => true, 'mensaje' => 'Cita cancelada.']);

// ════ MÓDULO MEDICAMENTOS ═════ // 

    // ── MEDICAMENTOS DEL PACIENTE ─────────────────────────────
    case 'mis_medicamentos':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);

        $stmt = conectar()->prepare(
            'SELECT m.id_medicamento, m.nombre, m.dosis, m.horario,
                    pm.fecha_inicio, pm.fecha_fin
             FROM paciente_medicamento pm
             JOIN medicamento m ON m.id_medicamento = pm.id_medicamento
             WHERE pm.id_paciente = ?
             ORDER BY pm.fecha_inicio DESC'
        );
        $stmt->execute([$idPaciente]);

        responder(200, ['ok' => true, 'medicamentos' => $stmt->fetchAll()]);

// ═════ MÓDULO MEDICAMENTOS LOCALES ═════ //

    // ── GUARDAR / ACTUALIZAR MEDICAMENTO LOCAL ─────────────────────────────
    case 'guardar_medicamento_local':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        $med = $body['med'] ?? null;
        if (!$med || empty($med['nombre'])) {
            responder(400, ['error' => 'Datos de medicamento incompletos.']);
        }

        $nombre    = trim($med['nombre']);
        $funcion   = trim($med['funcion'] ?? '');
        $dosis     = trim($med['dosis'] ?? '');
        $momento   = trim($med['momento'] ?? '');
        $notas     = trim($med['notas'] ?? '');
        $alarma    = !empty($med['alarma']) ? 1 : 0;
        $horarios  = json_encode($med['horarios'] ?? []);
        $fInicio   = $med['fecha_inicio'] ?? date('Y-m-d');
        $fFin      = !empty($med['fecha_fin']) ? $med['fecha_fin'] : null;
        $clientId  = trim($med['id'] ?? '');

        // Buscar si ya existe un registro con ese client_id para este paciente
        $stmt = $pdo->prepare(
            'SELECT id_pm FROM medicamento_detalle WHERE id_paciente = ? AND client_id = ? LIMIT 1'
        );
        $stmt->execute([$idPaciente, $clientId]);
        $existe = $stmt->fetch();

        if ($existe) {
            // Actualizar
            $pdo->prepare(
                'UPDATE medicamento_detalle
                 SET nombre=?, funcion=?, dosis=?, momento=?, notas=?, alarma=?, horarios=?, fecha_inicio=?, fecha_fin=?
                 WHERE id_pm=?'
            )->execute([$nombre, $funcion, $dosis, $momento, $notas, $alarma, $horarios, $fInicio, $fFin, $existe['id_pm']]);
        } else {
            // Insertar
            $pdo->prepare(
                'INSERT INTO medicamento_detalle
                 (id_paciente, client_id, nombre, funcion, dosis, momento, notas, alarma, horarios, fecha_inicio, fecha_fin)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([$idPaciente, $clientId, $nombre, $funcion, $dosis, $momento, $notas, $alarma, $horarios, $fInicio, $fFin]);
        }

        responder(200, ['ok' => true, 'mensaje' => 'Medicamento guardado.']);

    // ── LISTAR MEDICAMENTOS DETALLADOS ─────────────────────────────────────
    case 'mis_medicamentos_detalle':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);

        $stmt = conectar()->prepare(
            'SELECT id_pm, client_id, nombre, funcion, dosis, momento, notas, alarma, horarios, fecha_inicio, fecha_fin
             FROM medicamento_detalle
             WHERE id_paciente = ?
             ORDER BY fecha_inicio DESC'
        );
        $stmt->execute([$idPaciente]);
        $rows = $stmt->fetchAll();

        // Decodificar horarios JSON
        foreach ($rows as &$r) {
            $r['horarios'] = json_decode($r['horarios'] ?? '[]', true) ?: [];
            $r['alarma']   = (bool)$r['alarma'];
        }

        responder(200, ['ok' => true, 'medicamentos' => $rows]);

// ════ MÓDULO MENSAJES (paciente ↔ familiar) ═════ //

    // ── ENVIAR MENSAJE ────────────────────────────────────────
    case 'enviar_mensaje':
        $usuario = autenticar();
        $pdo     = conectar();

        if (empty($body['contenido']) || empty($body['id_familiar'])) {
            responder(400, ['error' => 'contenido e id_familiar son requeridos.']);
        }

        $idFamiliar = (int) $body['id_familiar'];

        if ($usuario['rol'] === 'paciente') {
            $idPaciente = getPacienteId($usuario);
            $remitente  = 'paciente';

            // Verificar que el familiar pertenece al paciente
            $stmt = $pdo->prepare(
                'SELECT id_familiar FROM familiar WHERE id_familiar=? AND id_paciente=?'
            );
            $stmt->execute([$idFamiliar, $idPaciente]);
            if (!$stmt->fetch()) {
                responder(403, ['error' => 'Familiar no vinculado a este paciente.']);
            }

        } elseif ($usuario['rol'] === 'familiar') {
            // Buscar id_paciente del familiar
            $stmt = $pdo->prepare(
                'SELECT id_paciente FROM familiar WHERE id_usuario = ? AND id_familiar = ?'
            );
            $stmt->execute([$usuario['id'], $idFamiliar]);
            $fam = $stmt->fetch();
            if (!$fam) {
                responder(403, ['error' => 'No tienes permiso para este chat.']);
            }
            $idPaciente = $fam['id_paciente'];
            $remitente  = 'familiar';

        } else {
            responder(403, ['error' => 'Solo pacientes y familiares pueden enviar mensajes.']);
        }

        $pdo->prepare(
            'INSERT INTO mensaje (id_paciente, id_familiar, remitente, contenido)
             VALUES (?,?,?,?)'
        )->execute([$idPaciente, $idFamiliar, $remitente, trim($body['contenido'])]);

        responder(201, ['ok' => true, 'mensaje' => 'Mensaje enviado.']);

    // ── VER CONVERSACIÓN ──────────────────────────────────────
    case 'conversacion':
        $usuario = autenticar();
        $pdo     = conectar();

        if (empty($body['id_familiar'])) {
            responder(400, ['error' => 'id_familiar es requerido.']);
        }

        $idFamiliar = (int) $body['id_familiar'];

        if ($usuario['rol'] === 'paciente') {
            $idPaciente = getPacienteId($usuario);
        } elseif ($usuario['rol'] === 'familiar') {
            $stmt = $pdo->prepare('SELECT id_paciente FROM familiar WHERE id_usuario=? AND id_familiar=?');
            $stmt->execute([$usuario['id'], $idFamiliar]);
            $fam = $stmt->fetch();
            if (!$fam) responder(403, ['error' => 'Acceso denegado.']);
            $idPaciente = $fam['id_paciente'];
        } else {
            responder(403, ['error' => 'Acceso denegado.']);
        }

        $limite = min((int)($body['limite'] ?? 50), 200);

        $stmt = $pdo->prepare(
            'SELECT id_mensaje, remitente, contenido, leido, fecha_envio
             FROM mensaje
             WHERE id_paciente=? AND id_familiar=?
             ORDER BY fecha_envio DESC
             LIMIT ?'
        );
        $stmt->bindValue(1, (int)$idPaciente,  PDO::PARAM_INT);
        $stmt->bindValue(2, (int)$idFamiliar,   PDO::PARAM_INT);
        $stmt->bindValue(3, (int)$limite,       PDO::PARAM_INT);
        $stmt->execute();
        $mensajes = array_reverse($stmt->fetchAll());

        // Marcar como leídos los mensajes del otro lado
        $otroRemitente = $usuario['rol'] === 'paciente' ? 'familiar' : 'paciente';
        $pdo->prepare(
            'UPDATE mensaje SET leido=1
             WHERE id_paciente=? AND id_familiar=? AND remitente=? AND leido=0'
        )->execute([$idPaciente, $idFamiliar, $otroRemitente]);

        responder(200, ['ok' => true, 'mensajes' => $mensajes]);

// ═══ MÓDULO INFORMES ════ //

    // ── GENERAR RESUMEN PARA PDF ──────────────────────────────
    case 'resumen_informe':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        // Datos del paciente
        $stmt = $pdo->prepare(
            'SELECT u.nombres, u.apellidos, u.cedula,
                    p.fecha_nacimiento, p.telefono,
                    e.nombre_eps
             FROM paciente p
             JOIN usuarios u ON u.id = p.id_usuario
             LEFT JOIN eps e ON e.id_eps = p.id_eps
             WHERE p.id_paciente = ?'
        );
        $stmt->execute([$idPaciente]);
        $datosPaciente = $stmt->fetch();

        // Últimos 10 signos vitales
        $stmt = $pdo->prepare(
            'SELECT t.nombre_parametro, t.unidad, r.valor, r.alerta, r.fecha
             FROM registro_salud r
             JOIN tipo_parametro t ON t.id_parametro = r.id_parametro
             WHERE r.id_paciente = ?
             ORDER BY r.fecha DESC LIMIT 10'
        );
        $stmt->execute([$idPaciente]);
        $signos = $stmt->fetchAll();

        // Próximas citas
        $stmt = $pdo->prepare(
            "SELECT fecha, hora, motivo, estado FROM cita_medica
             WHERE id_paciente=? AND fecha >= CURDATE() AND estado != 'cancelada'
             ORDER BY fecha ASC LIMIT 5"
        );
        $stmt->execute([$idPaciente]);
        $citas = $stmt->fetchAll();

        // Medicamentos activos
        $stmt = $pdo->prepare(
            'SELECT m.nombre, m.dosis, m.horario
             FROM paciente_medicamento pm
             JOIN medicamento m ON m.id_medicamento = pm.id_medicamento
             WHERE pm.id_paciente = ?
               AND (pm.fecha_fin IS NULL OR pm.fecha_fin >= CURDATE())'
        );
        $stmt->execute([$idPaciente]);
        $medicamentos = $stmt->fetchAll();

        // Guardar referencia del informe
        $pdo->prepare(
            'INSERT INTO informe (id_paciente, descripcion) VALUES (?, "Informe generado desde app")'
        )->execute([$idPaciente]);

        responder(200, [
            'ok'          => true,
            'paciente'    => $datosPaciente,
            'signos'      => $signos,
            'citas'       => $citas,
            'medicamentos'=> $medicamentos,
            'generado_en' => date('Y-m-d H:i:s'),
        ]);

// ═══ MÓDULO NOTIFICACIONES ════ // 

    // ── MIS NOTIFICACIONES ────────────────────────────────────
    case 'mis_notificaciones':
        $usuario = autenticar();

        $stmt = conectar()->prepare(
            'SELECT id_notificacion, tipo, titulo, cuerpo, leida, fecha
             FROM notificacion
             WHERE id_usuario = ?
             ORDER BY fecha DESC
             LIMIT 30'
        );
        $stmt->execute([$usuario['id']]);

        responder(200, ['ok' => true, 'notificaciones' => $stmt->fetchAll()]);

    // ── MARCAR NOTIFICACIÓN COMO LEÍDA ───────────────────────
    case 'leer_notificacion':
        $usuario = autenticar();
        $pdo     = conectar();

        if (empty($body['id_notificacion'])) {
            responder(400, ['error' => 'id_notificacion es requerido.']);
        }

        $pdo->prepare(
            'UPDATE notificacion SET leida=1 WHERE id_notificacion=? AND id_usuario=?'
        )->execute([(int)$body['id_notificacion'], $usuario['id']]);

        responder(200, ['ok' => true, 'mensaje' => 'Notificación marcada como leída.']);

// ═══ DEFAULT ════ // 

    // ── MIS ENFERMEDADES ─────────────────────────────────────
    case 'mis_enfermedades':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);

        $stmt = conectar()->prepare(
            'SELECT e.id_enfermedad, e.nombre, e.categoria, pe.fecha_diagnostico, pe.notas
             FROM paciente_enfermedad pe
             JOIN enfermedad e ON e.id_enfermedad = pe.id_enfermedad
             WHERE pe.id_paciente = ?
             ORDER BY e.categoria, e.nombre'
        );
        $stmt->execute([$idPaciente]);
        $enfermedades = $stmt->fetchAll();

        // Traer también condiciones personalizadas del diagnóstico
        $stmt2 = conectar()->prepare(
            "SELECT descripcion, fecha_diagnostico FROM diagnostico
             WHERE id_paciente = ? AND descripcion LIKE 'Otras condiciones al registro:%'
             ORDER BY fecha_diagnostico DESC LIMIT 1"
        );
        $stmt2->execute([$idPaciente]);
        $otras = $stmt2->fetch();

        responder(200, [
            'ok'          => true,
            'enfermedades' => $enfermedades,
            'otras'        => $otras ? str_replace('Otras condiciones al registro: ', '', $otras['descripcion']) : '',
        ]);

// ═══ MÓDULO BIOMÉTRICOS ════ //

    // ── GUARDAR DATOS BIOMÉTRICOS Y RANGOS PERSONALIZADOS ────
    case 'guardar_biometricos':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        $estatura = isset($body['estatura_cm']) ? (float)$body['estatura_cm'] : null;
        $peso     = isset($body['peso_kg'])     ? (float)$body['peso_kg']     : null;
        $actividad = trim($body['actividad'] ?? '');
        $condicion = trim($body['condicion'] ?? 'ninguna');

        if (!$estatura || $estatura < 100 || $estatura > 220) {
            responder(400, ['error' => 'Estatura inválida.']);
        }
        if (!$peso || $peso < 20 || $peso > 300) {
            responder(400, ['error' => 'Peso inválido.']);
        }
        $nivelesPermitidos = ['sedentario','moderado','activo','atleta'];
        if (!in_array($actividad, $nivelesPermitidos, true)) {
            responder(400, ['error' => 'Nivel de actividad inválido.']);
        }

        // Guardar / actualizar datos biométricos en tabla paciente_biometrico
        $pdo->prepare(
            'INSERT INTO paciente_biometrico (id_paciente, estatura_cm, peso_kg, actividad, condicion)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               estatura_cm = VALUES(estatura_cm),
               peso_kg     = VALUES(peso_kg),
               actividad   = VALUES(actividad),
               condicion   = VALUES(condicion),
               actualizado = NOW()'
        )->execute([$idPaciente, $estatura, $peso, $actividad, $condicion]);

        // Guardar rangos personalizados calculados desde el frontend
        $rangos = $body['rangos'] ?? [];
        if (is_array($rangos) && !empty($rangos)) {
            $stmtRango = $pdo->prepare(
                'INSERT INTO rango_paciente (id_paciente, id_parametro, rango_min, rango_max, fuente)
                 VALUES (?, ?, ?, ?, "calculado")
                 ON DUPLICATE KEY UPDATE
                   rango_min = VALUES(rango_min),
                   rango_max = VALUES(rango_max),
                   fuente    = "calculado"'
            );
            foreach ($rangos as $r) {
                $idParam = (int)($r['id_parametro'] ?? 0);
                $rMin    = isset($r['rango_min']) ? (float)$r['rango_min'] : null;
                $rMax    = isset($r['rango_max']) ? (float)$r['rango_max'] : null;
                if ($idParam > 0 && $rMin !== null && $rMax !== null) {
                    $stmtRango->execute([$idPaciente, $idParam, $rMin, $rMax]);
                }
            }
        }

        responder(200, [
            'ok'      => true,
            'mensaje' => 'Datos biométricos y rangos guardados correctamente.',
        ]);

    // ── OBTENER DATOS BIOMÉTRICOS DEL PACIENTE ────────────────
    case 'mis_biometricos':
        $usuario    = autenticar();
        $idPaciente = getPacienteId($usuario);
        $pdo        = conectar();

        // Datos biométricos
        $stmt = $pdo->prepare(
            'SELECT estatura_cm, peso_kg, actividad, condicion, actualizado
             FROM paciente_biometrico
             WHERE id_paciente = ?'
        );
        $stmt->execute([$idPaciente]);
        $bio = $stmt->fetch();

        if (!$bio) {
            responder(200, ['ok' => true, 'biometricos' => null]);
        }

        // Rangos personalizados guardados
        $stmtR = $pdo->prepare(
            'SELECT rp.id_parametro, t.nombre_parametro AS nombre, rp.rango_min, rp.rango_max, t.unidad, rp.fuente
             FROM rango_paciente rp
             JOIN tipo_parametro t ON t.id_parametro = rp.id_parametro
             WHERE rp.id_paciente = ?
             ORDER BY t.nombre_parametro'
        );
        $stmtR->execute([$idPaciente]);
        $bio['rangos'] = $stmtR->fetchAll();

        responder(200, ['ok' => true, 'biometricos' => $bio]);

    default:
        responder(400, ['error' => "Acción '$accion' no reconocida."]);
}
