'use strict';

/* ── Estado global ── */
const App = {
  usuario:      null,   // objeto usuario del servidor
  token:        null,   // Bearer token de sesión
  paginaActual: 'pagina-bienvenida',
};

const API_URL = 'api.php';   // misma carpeta que el HTML

/* ── Selectores cortos ── */
const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

/* ── Exposición global para que Vue (scope separado) pueda acceder ── */
window.App     = App;
window.API_URL = API_URL;
// NOTA: window.api y window.mostrarToast se exponen abajo,
// después de que las funciones estén definidas.

/* ══ PERSISTENCIA DE SESIÓN (localStorage) ══ */
function guardarSesion(usuario, token) {
  App.usuario = usuario;
  App.token   = token;
  localStorage.setItem('tc_token',   token);
  localStorage.setItem('tc_usuario', JSON.stringify(usuario));
}

function restaurarSesion() {
  const token   = localStorage.getItem('tc_token');
  const usuario = localStorage.getItem('tc_usuario');
  if (token && usuario) {
    App.token   = token;
    App.usuario = JSON.parse(usuario);
    return true;
  }
  return false;
}

function limpiarSesion() {
  // Limpiar caché específico del usuario ANTES de borrar App.usuario
  if (App.usuario?.id) {
    const uid = App.usuario.id;
    localStorage.removeItem(`tc_signos_historial_${uid}`);
    localStorage.removeItem(`tc_signos_parametros_${uid}`);
    localStorage.removeItem(`tc_citas_${uid}`);
  }
  // También limpiar claves legacy por si acaso
  localStorage.removeItem('tc_signos_historial');
  localStorage.removeItem('tc_signos_parametros');
  App.usuario = null;
  App.token   = null;
  localStorage.removeItem('tc_token');
  localStorage.removeItem('tc_usuario');

  // Limpiar el DOM de datos del usuario anterior para evitar flash al siguiente login
  const listaCitas = document.getElementById('lista-citas-alarmas');
  if (listaCitas) listaCitas.innerHTML = '';
  const listaCitasDash = document.querySelector('.citas-lista');
  if (listaCitasDash) listaCitasDash.innerHTML = '';
}

/* ═════ LLAMADAS A LA API ══════ */
async function api(accion, datos = {}, requiereAuth = false) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (requiereAuth && App.token) {
      headers['Authorization'] = `Bearer ${App.token}`;
    }
    // Enviar token también en el body — fallback cuando XAMPP bloquea Authorization
    const bodyData = (requiereAuth && App.token)
      ? { accion, _token: App.token, ...datos }
      : { accion, ...datos };
    const res  = await fetch(API_URL, {
      method:  'POST',
      headers,
      body:    JSON.stringify(bodyData),
    });
    const json = await res.json();

    // Si el token expiró DURANTE el uso normal (no en el arranque), cerrar sesión
    if (res.status === 401 && requiereAuth && App._sesionVerificada) {
      limpiarSesion();
      mostrarToast('⚠️', 'Sesión expirada', 'Por favor vuelve a iniciar sesión.');
      setTimeout(() => irA('pagina-login'), 1000);
      return { ok: false, error: 'Sesión expirada' };
    }

    return { ok: res.ok, status: res.status, ...json };
  } catch (err) {
    console.error('Error de red:', err);
    return { ok: false, error: '¿Está XAMPP corriendo? No se pudo conectar con el servidor.' };
  }
}

/* ════ NAVEGACIÓN ════ */
const PAGINAS_PROTEGIDAS = [
  'pagina-dashboard', 'pagina-seguimiento', 'pagina-mensajes',
  'pagina-alarmas',   'pagina-perfil',      'pagina-registrar-signo',
  'pagina-agendar-cita',
];

function irA(paginaId) {
  // Bloquear acceso a páginas protegidas sin sesión
  if (PAGINAS_PROTEGIDAS.includes(paginaId) && !App.token) {
    mostrarToast('🔒', 'Acceso restringido', 'Debes iniciar sesión primero.');
    irA('pagina-login');
    return;
  }

  $$('section[id]').forEach(s => s.classList.remove('pagina-activa'));
  const destino = $(`#${paginaId}`);
  if (!destino) return;
  destino.classList.add('pagina-activa');
  App.paginaActual = paginaId;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  $$('.sidebar-nav a').forEach(a => {
    a.classList.remove('activo');
    if (a.getAttribute('href') === `#${paginaId}`) a.classList.add('activo');
  });

  const titulos = {
    'pagina-bienvenida':       'Te Cuido — Bienvenida',
    'pagina-login':            'Te Cuido — Iniciar sesión',
    'pagina-registro':         'Te Cuido — Registro',
    'pagina-confirmacion':     'Te Cuido — Confirmación',
    'pagina-datos-validados':  'Te Cuido — Datos validados',
    'pagina-dashboard':        'Te Cuido — Inicio',
    'pagina-seguimiento':      'Te Cuido — Seguimiento',
    'pagina-registrar-signo':  'Te Cuido — Registrar signo vital',
    'pagina-mensajes':         'Te Cuido — Mensajes',
    'pagina-alarmas':          'Te Cuido — Alarmas y citas',
    'pagina-agendar-cita':     'Te Cuido — Agendar cita',
    'pagina-perfil':           'Te Cuido — Perfil',
  };
  document.title = titulos[paginaId] || 'Te Cuido';

  // Cargar datos dinámicos según la página
  if (paginaId === 'pagina-dashboard') cargarDashboard();
  if (paginaId === 'pagina-alarmas')   cargarCitas();
  if (paginaId === 'pagina-perfil')    cargarPerfil();
  if (paginaId === 'pagina-mensajes')  cargarMensajes();

  if (paginaId === 'pagina-seguimiento') {
    // Un solo punto de entrada para Vue — nunca llamar irA('pagina-seguimiento') recursivamente
    setTimeout(iniciarVueSignos, 60);
    return;
  }

  if (paginaId === 'pagina-registrar-signo') {
   
    $$('section[id]').forEach(s => s.classList.remove('pagina-activa'));
    const secSeg = document.getElementById('pagina-seguimiento');
    if (secSeg) secSeg.classList.add('pagina-activa');
    App.paginaActual = 'pagina-seguimiento';
    document.title = 'Te Cuido — Seguimiento';
    $$('.sidebar-nav a').forEach(a => {
      a.classList.remove('activo');
      if (a.getAttribute('href') === '#pagina-seguimiento') a.classList.add('activo');
    });
    // Montar Vue (o redibujar si ya existe) y luego abrir el formulario
    setTimeout(() => {
      iniciarVueSignos();
      const abrirForm = (n) => {
        const vue = window._vueSignosApp;
        if (vue && typeof vue.abrirFormNuevo === 'function') {
          vue.abrirFormNuevo();
        } else if (n > 0) {
          setTimeout(() => abrirForm(n - 1), 150);
        }
      };
      setTimeout(() => abrirForm(12), 120);
    }, 60);
    return;
  }

  // ── Módulo Vue de citas médicas ──────────────────────────────────────────
  if (paginaId === 'pagina-agendar-cita') {
    setTimeout(() => {
      if (typeof iniciarVueCitas === 'function') iniciarVueCitas();
    }, 0);
    // No retornar: la sección ya quedó activa por el código de irA() de arriba
  }
}

function iniciarNavegacion() {
  document.addEventListener('click', e => {
    const enlace = e.target.closest('a[href^="#pagina-"]');
    if (!enlace) return;
    e.preventDefault();
    irA(enlace.getAttribute('href').slice(1));
  });
}

/* ══ BIENVENIDA ══ */
function configurarBienvenida() {
  const btn = $('#btn-bienvenida');
  if (btn) btn.addEventListener('click', () => irA('pagina-login'));
}

/* ═══ LOGIN ════ */
function configurarLogin() {
  const form = $('#formulario-login');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const correo     = $('#correo-login').value.trim();
    const contrasena = $('#contrasena-login').value.trim();

    if (!correo || !contrasena) {
      mostrarToast('⚠️', 'Campos requeridos', 'Ingresa tu correo y contraseña.');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Ingresando…');

    const resp = await api('login', { correo, contrasena });

    setLoading(btn, false, 'Ingresar');

    if (!resp.ok) {
      mostrarToast('❌', 'Error al ingresar', resp.error || 'No se pudo iniciar sesión.');
      return;
    }

    guardarSesion(resp.usuario, resp.token);
    App._sesionVerificada = true;
    actualizarUI();
    mostrarToast('✅', '¡Bienvenid@!', `Hola, ${App.usuario.nombres.split(' ')[0]}.`);
    setTimeout(() => irA('pagina-datos-validados'), 800);
  });
}

/* ══ REGISTRO — selector de tipo, sexo y vinculación ══ */

/** Activa las tarjetas Paciente / Familiar y muestra u oculta las secciones de vinculación */
function configurarSelectorTipoRegistro() {
  const radios      = document.querySelectorAll('input[name="tipo-registro"]');
  const inputRol    = $('#rol');
  const secCuidador = $('#seccion-vincular-cuidador');
  const secPaciente = $('#seccion-vincular-paciente');

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (inputRol) inputRol.value = radio.value;

      if (radio.value === 'paciente') {
        if (secCuidador) secCuidador.style.display = 'block';
        if (secPaciente) secPaciente.style.display = 'none';
        const cp = $('#codigo-paciente');
        if (cp) { cp.required = false; cp.style.borderColor = ''; }
      } else {
        if (secCuidador) secCuidador.style.display = 'none';
        if (secPaciente) secPaciente.style.display = 'block';
        const cp = $('#codigo-paciente');
        if (cp) cp.required = true;
      }
    });
  });
}

/** Cambia el avatar del círculo según el sexo seleccionado (Mujer / Hombre) */
function configurarSelectorSexo() {
  const radios  = document.querySelectorAll('input[name="sexo"]');
  const img     = $('#reg-avatar-img');
  const circulo = $('#reg-avatar-circle');

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!img) return;
      img.src = radio.value === 'F' ? 'imagenes/mujer.png' : 'imagenes/hombre.png';
      img.alt = radio.value === 'F' ? 'Mujer' : 'Hombre';
      if (circulo) circulo.classList.add('tiene-foto');
    });
  });
}

function configurarRegistro() {
  const form = $('#formulario-registro');
  if (!form) return;

  // Efecto visual en chips de las enfermedades
  document.querySelectorAll('.enf-chip input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', function () {
      this.closest('.enf-chip').classList.toggle('enf-chip--activo', this.checked);
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();

    // 1. Tipo de usuario obligatorio
    const tipoSeleccionado = document.querySelector('input[name="tipo-registro"]:checked');
    if (!tipoSeleccionado) {
      mostrarToast('⚠️', 'Selecciona tu tipo de usuario', 'Indica si eres paciente o familiar/cuidador.');
      return;
    }

    // 2. Sexo obligatorio
    const sexoSeleccionado = document.querySelector('input[name="sexo"]:checked');
    if (!sexoSeleccionado) {
      mostrarToast('⚠️', 'Selecciona tu sexo', 'Por favor indica si eres hombre o mujer.');
      return;
    }

    const nombres          = $('#nombres').value.trim();
    const apellidos        = $('#apellidos').value.trim();
    const correo           = $('#correo-registro').value.trim();
    const cedula           = $('#cedula').value.trim();
    const contrasena       = $('#contrasena-registro').value.trim();
    const id_eps           = $('#eps').value;
    const rol              = $('#rol').value;
    const fecha_nacimiento = $('#fecha-nacimiento').value;
    const telefono         = $('#telefono').value.trim();
    const sexo             = sexoSeleccionado.value;

    // Recopilar enfermedades marcadas
    const enfermedades = [];
    document.querySelectorAll('input[name="enfermedades"]:checked').forEach(cb => {
      enfermedades.push(parseInt(cb.value));
    });
    const otras_enfermedades = ($('#enf-otras')?.value || '').trim();

    if (!nombres || !apellidos || !correo || !cedula || !contrasena || !id_eps || !rol) {
      mostrarToast('⚠️', 'Campos incompletos', 'Por favor completa todos los campos obligatorios.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      mostrarToast('⚠️', 'Correo inválido', 'Ingresa un correo electrónico válido.');
      return;
    }

    if (contrasena.length < 8) {
      mostrarToast('⚠️', 'Contraseña corta', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    // 3. Si es familiar/cuidador: código de paciente obligatorio
    let codigo_paciente = '';
    let codigo_cuidador = '';
    if (rol === 'familiar') {
      codigo_paciente = ($('#codigo-paciente')?.value || '').trim();
      if (!codigo_paciente) {
        mostrarToast('⚠️', 'Código del paciente requerido', 'Debes ingresar el código del paciente para finalizar el registro.');
        const cp = $('#codigo-paciente');
        if (cp) {
          cp.style.borderColor = 'var(--rojo-suave)';
          cp.focus();
          setTimeout(() => { cp.style.borderColor = ''; }, 3500);
        }
        return;
      }
    } else {
      codigo_cuidador = ($('#codigo-cuidador')?.value || '').trim();
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Registrando…');

    const resp = await api('registro', {
      nombres, apellidos, correo, cedula, contrasena,
      id_eps: parseInt(id_eps), rol, fecha_nacimiento, telefono,
      sexo, enfermedades, otras_enfermedades,
      ...(codigo_paciente ? { codigo_paciente } : {}),
      ...(codigo_cuidador ? { codigo_cuidador } : {}),
    });

    setLoading(btn, false, 'Registrarse');

    if (!resp.ok) {
      mostrarToast('❌', 'Error en el registro', resp.error || 'No se pudo crear la cuenta.');
      return;
    }

    guardarSesion(resp.usuario, resp.token);
    App._sesionVerificada = true;
    actualizarUI();
    mostrarToast('🎉', '¡Registro exitoso!', 'Tu cuenta ha sido creada correctamente.');
    setTimeout(() => irA('pagina-confirmacion'), 700);
  });
}

/* ═══ CERRAR SESIÓN ═══ */
function configurarCerrarSesion() {
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-accion="cerrar-sesion"]');
    if (!btn) return;
    // Notificar al servidor
    await api('logout', {}, true);
    limpiarSesion();
    mostrarToast('👋', 'Sesión cerrada', 'Hasta pronto.');
    setTimeout(() => irA('pagina-login'), 700);
  });
}

/* ═══ AVATAR POR SEXO — actualiza todas las fotos del usuario ════ */
function aplicarAvatarSexo(sexo) {
  let src;
  if (sexo === 'F') {
    src = 'imagenes/mujer.png';
  } else if (sexo === 'M') {
    src = 'imagenes/hombre.png';
  } else {
    // Sin sexo definido: SVG inline como data URI — no hace petición HTTP
    src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%232d7d5a'/%3E%3Ccircle cx='20' cy='15' r='7' fill='%23fff' opacity='.9'/%3E%3Cellipse cx='20' cy='34' rx='12' ry='9' fill='%23fff' opacity='.9'/%3E%3C/svg%3E";
  }

  // Todos los headers y perfil
  $$('.avatar-usuario').forEach(img => { img.src = src; });

  // Pantalla datos-validados (confirmación de login/registro)
  const avDV = $('#avatar-datos-validados');
  if (avDV) avDV.src = src;
}

/* ═══ ACTUALIZAR UI GLOBAL CON DATOS DEL USUARIO ═══ */
function actualizarUI() {
  const u = App.usuario;
  if (!u) return;
  const primer  = u.nombres.split(' ')[0];
  const completo = `${u.nombres} ${u.apellidos}`;

  // Avatar según sexo (en todos los headers, perfil y datos-validados)
  aplicarAvatarSexo(u.sexo || '');

  // Saludos y títulos
  const saludo = $('.dashboard-saludo h2');
  if (saludo) saludo.textContent = `Hola, ${primer} 👋`;

  const validado = $('#nombre-validado');
  if (validado) validado.textContent = `¡Bienvenid@, ${primer}!`;

  const perfilNombre = $('.perfil-nombre');
  if (perfilNombre) perfilNombre.textContent = completo;

  const perfilRol = $('.perfil-rol');
  if (perfilRol) perfilRol.textContent = `${u.correo} · ${u.rol}`;
}

/* ═══ DASHBOARD — cargar citas y medicamentos reales ════ */
async function cargarDashboard() {
  actualizarUI();
  animarBarraProgreso();

  if (!App.token || App.usuario?.rol !== 'paciente') return;

  // Las 3 peticiones se lanzan en paralelo con Promise.all
  // Tiempo total = el más lento de los 3, no la suma de los 3
  const [resCitas, resMeds, resNotif] = await Promise.all([
    api('mis_citas',          {}, true),
    api('mis_medicamentos',   {}, true),
    api('mis_notificaciones', {}, true),
  ]);

  // Citas próximas
  if (resCitas.ok && resCitas.citas?.length) {
    const lista = $('.citas-lista');
    if (lista) {
      const proximas = resCitas.citas
        .filter(c => c.estado !== 'cancelada' && c.fecha >= hoy())
        .slice(0, 3);
      lista.innerHTML = proximas.length
        ? proximas.map(c => {
            const [, mes, dia] = c.fecha.split('-');
            const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            return `<div class="cita-item">
              <div class="cita-fecha"><div class="dia">${parseInt(dia)}</div><div class="mes">${meses[parseInt(mes)]}</div></div>
              <div class="cita-info"><strong>${c.motivo || 'Cita médica'}</strong><p>${c.estado}</p></div>
              <div class="cita-hora">${c.hora?.slice(0,5) || ''}</div>
            </div>`;
          }).join('')
        : '<p style="color:var(--texto-suave);padding:12px 0;">No tienes citas próximas.</p>';
    }
  }

  // Medicamentos activos
  if (resMeds.ok && resMeds.medicamentos?.length) {
    const cont = $('.medicamentos-dashboard');
    if (cont) {
      cont.innerHTML = resMeds.medicamentos.slice(0, 3).map(m => `
        <div class="medicamento-item">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="seguimiento-icono icono-svg"><img src="iconos/pastilla.png" width="16" height="16" alt="med"></div>
            <div class="medicamento-info"><strong>${m.nombre}</strong><p>${m.horario || '—'}</p></div>
          </div>
          <div class="medicamento-hora">${m.dosis || ''}</div>
        </div>`).join('');
    }
  }

  // Notificaciones (badge)
  if (resNotif.ok) {
    const noLeidas = resNotif.notificaciones?.filter(n => n.leida == 0).length || 0;
    const badge = $('#notif-badge');
    if (badge) {
      badge.textContent = noLeidas;
      badge.style.display = noLeidas > 0 ? 'flex' : 'none';
    }
  }
}

/* ═══ SEGUIMIENTO — signos vitales ════ */
async function cargarSignos() {
  animarGrafico();
  if (!App.token || App.usuario?.rol !== 'paciente') return;

  const resp = await api('historial_signos', { limite: 10 }, true);
  if (!resp.ok) return;

  const contenedor = $('#lista-signos');
  if (!contenedor) return;

  if (!resp.registros?.length) {
    contenedor.innerHTML = '<p style="color:var(--texto-suave);padding:16px 0;">Aún no tienes registros de signos vitales.<br>¡Registra tu primer signo!</p>';
    return;
  }

  contenedor.innerHTML = resp.registros.map(r => {
    const color = r.alerta == 1 ? 'var(--rojo-suave)' : 'var(--verde)';
    return `<div class="modulo-item">
      <div class="modulo-icono icono-svg" style="color:${color};">
        <img src="iconos/corazon.png" width="18" height="18" alt="signo">
      </div>
      <div class="modulo-info">
        <strong>${r.nombre_parametro}</strong>
        <p>${r.valor} ${r.unidad || ''} ${r.alerta == 1 ? '⚠️ Fuera de rango' : '✓ Normal'}</p>
        <small style="color:var(--texto-suave);">${formatearFechaHora(r.fecha)}</small>
      </div>
      ${r.observacion ? `<span style="font-size:.78rem;color:var(--texto-suave);">${r.observacion}</span>` : ''}
    </div>`;
  }).join('');
}

/* ═══ REGISTRAR SIGNO VITAL ═════ */
async function cargarParametros() {
  const select = $('#select-parametro');
  if (!select) return;

  const resp = await api('parametros', {}, true);
  if (!resp.ok) return;

  select.innerHTML = '<option value="">Selecciona parámetro...</option>' +
    resp.parametros.map(p =>
      `<option value="${p.id_parametro}" data-unidad="${p.unidad || ''}" data-min="${p.rango_min || ''}" data-max="${p.rango_max || ''}">${p.nombre_parametro} (${p.unidad || 'sin unidad'})</option>`
    ).join('');
}

function configurarFormSigno() {
  const form = $('#formulario-signo');
  if (!form) return;

  const select = $('#select-parametro');
  if (select) {
    select.addEventListener('change', () => {
      const opt = select.options[select.selectedIndex];
      const info = $('#info-rango');
      if (info) {
        const min = opt.dataset.min, max = opt.dataset.max, unidad = opt.dataset.unidad;
        info.textContent = (min && max)
          ? `Rango normal: ${min} – ${max} ${unidad}`
          : 'Sin rango de referencia definido.';
      }
    });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const id_parametro = $('#select-parametro').value;
    const valor        = parseFloat($('#valor-signo').value);
    const observacion  = $('#observacion-signo')?.value.trim() || '';

    if (!id_parametro || isNaN(valor)) {
      mostrarToast('⚠️', 'Datos incompletos', 'Selecciona el parámetro e ingresa un valor.');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Guardando…');

    const resp = await api('registrar_signo', { id_parametro: parseInt(id_parametro), valor, observacion }, true);

    setLoading(btn, false, 'Guardar registro');

    if (!resp.ok) {
      mostrarToast('❌', 'Error', resp.error || 'No se pudo guardar.');
      return;
    }

    if (resp.alerta) {
      mostrarToast('⚠️', '¡Alerta!', 'Tu signo vital está fuera del rango normal. Contacta a tu médico.', 5000);
    } else {
      mostrarToast('✅', 'Registrado', 'Signo vital guardado correctamente.');
    }

    form.reset();
    setTimeout(() => irA('pagina-seguimiento'), 1000);
  });
}

/* ═══ CITAS MÉDICAS ═══ */
async function cargarCitas() {
  const contenedor = $('#lista-citas-alarmas');
  if (!contenedor) return;

  if (!App.token || App.usuario?.rol !== 'paciente') {
    contenedor.innerHTML = '<p style="color:var(--texto-suave);padding:16px 0;">Inicia sesión como paciente para ver tus citas.</p>';
    return;
  }

  // Limpiar contenido anterior ANTES de hacer la llamada para evitar mostrar citas de otro usuario
  contenedor.innerHTML = '<p style="color:var(--texto-suave);padding:16px 0;">Cargando citas...</p>';

  const resp = await api('mis_citas', {}, true);

  if (!resp.ok || !resp.citas?.length) {
    contenedor.innerHTML = '<p style="color:var(--texto-suave);padding:16px 0;">No tienes citas agendadas.</p>';
    return;
  }

  const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  contenedor.innerHTML = resp.citas.map(c => {
    const [, mes, dia] = c.fecha.split('-');
    const colorEstado = {
      pendiente: 'var(--acento)', confirmada: 'var(--verde)',
      cancelada: 'var(--rojo-suave)', realizada: 'var(--texto-suave)',
    }[c.estado] || 'var(--texto-suave)';

    return `<div class="alarma-item" data-id="${c.id_cita}">
      <div class="alarma-icono icono-svg"><img src="iconos/calendario.png" width="18" height="18" alt="cita"></div>
      <div class="alarma-info">
        <span class="alarma-nombre">${c.motivo || 'Cita médica'}</span>
        <div class="alarma-detalle">
          <span style="color:${colorEstado};font-weight:500;">${c.estado}</span>
        </div>
      </div>
      <div class="alarma-hora">
        <strong>${c.hora?.slice(0,5) || ''}</strong>
        <span>${parseInt(dia)} ${meses[parseInt(mes)]}</span>
        ${c.estado === 'pendiente'
          ? `<button class="btn-ghost btn-sm cancelar-cita" data-id="${c.id_cita}" style="margin-top:4px;font-size:.7rem;color:var(--rojo-suave);">Cancelar</button>`
          : ''}
      </div>
    </div>`;
  }).join('');

  // Botones cancelar
  contenedor.querySelectorAll('.cancelar-cita').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id_cita = parseInt(btn.dataset.id);
      const resp2 = await api('cancelar_cita', { id_cita }, true);
      if (resp2.ok) {
        mostrarToast('✅', 'Cita cancelada', 'La cita fue cancelada exitosamente.');
        cargarCitas();
      } else {
        mostrarToast('❌', 'Error', resp2.error || 'No se pudo cancelar.');
      }
    });
  });
}

function configurarFormCita() {
  const form = $('#formulario-cita');
  if (!form) return;

  // Fecha mínima: hoy
  const inputFecha = $('#cita-fecha');
  if (inputFecha) inputFecha.min = hoy();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fecha  = $('#cita-fecha').value;
    const hora   = $('#cita-hora').value;
    const motivo = $('#cita-motivo').value.trim();

    if (!fecha || !hora) {
      mostrarToast('⚠️', 'Campos requeridos', 'Selecciona fecha y hora para la cita.');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Agendando…');

    const resp = await api('agendar_cita', { fecha, hora, motivo }, true);

    setLoading(btn, false, 'Agendar cita');

    if (!resp.ok) {
      mostrarToast('❌', 'Error', resp.error || 'No se pudo agendar la cita.');
      return;
    }

    mostrarToast('✅', '¡Cita agendada!', `Tu cita quedó programada para el ${fecha} a las ${hora}.`);
    form.reset();
    setTimeout(() => irA('pagina-alarmas'), 900);
  });
}

/* ═══ MENSAJES ═══ */
let familiarActivo = null;   // id_familiar del chat abierto

async function cargarMensajes() {
  if (!App.token || App.usuario?.rol !== 'paciente') return;

  // Aquí se cargarian la lista de familiares del paciente (Plan a futuro)
  // Por el momento solo presnetamos el chat cuando se selecciona una conversación (Mejoras en proceso)
}

function configurarMensajes() {
  // Selección de conversación (familiares - actualmente estáticos en el HTML) (Futuras mejoras)
  document.addEventListener('click', e => {
    const conv = e.target.closest('.conversacion-item');
    if (!conv) return;
    $$('.conversacion-item').forEach(c => c.classList.remove('activa'));
    conv.classList.add('activa');

    familiarActivo = parseInt(conv.dataset.idFamiliar) || null;
    const nombre = conv.dataset.nombre || conv.querySelector('.conv-nombre')?.textContent;
    const chatNombre = $('.chat-nombre');
    if (chatNombre && nombre) chatNombre.textContent = nombre;

    if (familiarActivo) cargarConversacion(familiarActivo);
  });

  // Enviar mensaje
  const btnEnviar = $('.btn-enviar');
  const inputChat = $('.chat-input');

  if (btnEnviar && inputChat) {
    const enviar = async () => {
      const texto = inputChat.value.trim();
      if (!texto) return;

      if (familiarActivo && App.token) {
        const resp = await api('enviar_mensaje', {
          contenido: texto,
          id_familiar: familiarActivo,
        }, true);

        if (resp.ok) {
          agregarBurbuja(texto, 'enviado');
          inputChat.value = '';
          inputChat.focus();
        } else {
          mostrarToast('❌', 'Error', resp.error || 'No se pudo enviar el mensaje.');
        }
      } else {
        // Sin API activa: modo demo
        agregarBurbuja(texto, 'enviado');
        inputChat.value = '';
        inputChat.focus();
        setTimeout(() => agregarBurbuja('Recibido 💚', 'recibido'), 1200);
      }
    };

    btnEnviar.addEventListener('click', enviar);
    inputChat.addEventListener('keydown', e => { if (e.key === 'Enter') enviar(); });
  }
}

async function cargarConversacion(idFamiliar) {
  const resp = await api('conversacion', { id_familiar: idFamiliar, limite: 30 }, true);
  if (!resp.ok) return;

  const chat = $('.chat-mensajes');
  if (!chat) return;

  chat.innerHTML = resp.mensajes.map(m =>
    `<div class="mensaje-burbuja mensaje-${m.remitente === 'paciente' ? 'enviado' : 'recibido'}">
      ${m.contenido}
      <small style="display:block;font-size:.68rem;opacity:.6;margin-top:4px;">${formatearFechaHora(m.fecha_envio)}</small>
    </div>`
  ).join('');

  chat.scrollTop = chat.scrollHeight;
}

function agregarBurbuja(texto, tipo) {
  const chat = $('.chat-mensajes');
  if (!chat) return;
  const div = document.createElement('div');
  div.className = `mensaje-burbuja mensaje-${tipo} anim-fadeup`;
  div.textContent = texto;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

/* ═══ PERFIL ════ */
async function cargarPerfil() {
  if (!App.token || App.usuario?.rol !== 'paciente') {
    actualizarDatosPersonales(App.usuario);
    return;
  }

  const [respPerfil, respEnf] = await Promise.all([
    api('perfil', {}, true),
    api('mis_enfermedades', {}, true),
    cargarBiometricos(),
  ]);

  if (respPerfil.ok) {
    const p = respPerfil.perfil;
    // Actualizar sexo en App.usuario si el servidor lo devuelve
    if (p.sexo && App.usuario) {
      App.usuario.sexo = p.sexo;
      localStorage.setItem('tc_usuario', JSON.stringify(App.usuario));
    }
    aplicarAvatarSexo(p.sexo || App.usuario?.sexo || '');
    actualizarDatosPersonales({
      ...App.usuario,
      telefono:         p.telefono,
      direccion:        p.direccion,
      fecha_nacimiento: p.fecha_nacimiento,
      eps:              p.nombre_eps,
    });
  }

  // Mostrar enfermedades en el perfil
  const listaEl = $('#perfil-enfermedades-lista');
  const otrasEl = $('#perfil-otras-enfermedades');
  if (listaEl) {
    if (respEnf.ok && respEnf.enfermedades?.length) {
      listaEl.innerHTML = respEnf.enfermedades.map(e =>
        `<span style="display:inline-flex;align-items:center;padding:5px 12px;border-radius:20px;
          background:var(--verde);color:#fff;font-size:.78rem;font-weight:500;">${e.nombre}</span>`
      ).join('');
    } else {
      listaEl.innerHTML = '<span style="color:var(--texto-suave);font-size:.85rem;">Sin condiciones registradas.</span>';
    }
  }
  if (otrasEl && respEnf.ok && respEnf.otras) {
    otrasEl.textContent = 'Otras: ' + respEnf.otras;
  }
}

function actualizarDatosPersonales(u) {
  if (!u) return;
  const completo = `${u.nombres} ${u.apellidos}`;

  const campos = {
    'nombre completo':    completo,
    'documento':          u.cedula         || '—',
    'teléfono':           u.telefono       || '—',
    'correo':             u.correo         || '—',
    'eps':                u.eps            || '—',
    'fecha de nacimiento': u.fecha_nacimiento ? formatearFecha(u.fecha_nacimiento) : '—',
    'rol':                u.rol            || '—',
    'dirección':          u.direccion      || '—',
  };

  $$('.datos-grid .dato-item').forEach(item => {
    const label = item.querySelector('.dato-label')?.textContent?.trim().toLowerCase();
    const valor = item.querySelector('.dato-valor');
    if (valor && campos[label] !== undefined) valor.textContent = campos[label];
  });

  const perfilNombre = $('.perfil-nombre');
  if (perfilNombre) perfilNombre.textContent = completo;

  const perfilRol = $('.perfil-rol');
  if (perfilRol) perfilRol.textContent = `${u.correo} · ${u.rol}`;
}

/* ═══ BIOMÉTRICOS ═════ */


function calcularRangosPersonalizados({ estatura_cm, peso_kg, actividad, condicion, sexo, edad }) {

  const imc = peso_kg / Math.pow(estatura_cm / 100, 2);
  const esAtleta    = actividad === 'atleta';
  const esActivo    = actividad === 'activo' || esAtleta;
  const esDiabetico = condicion === 'diabetico';
  const esHipertenso= condicion === 'hipertenso';
  const esEmbarazada= condicion === 'embarazada';

  // ── Presión arterial sistólica ────────────────────────────
  let paMin = 90, paMax = 120;
  if (esHipertenso)   { paMax = 140; }
  if (esEmbarazada)   { paMax = 130; }
  if (esAtleta)       { paMin = 85;  paMax = 125; }

  // ── Presión diastólica ────────────────────────────────────
  let pdMin = 60, pdMax = 80;
  if (esHipertenso)   { pdMax = 90; }
  if (esEmbarazada)   { pdMax = 85; }

  // ── Glucosa en ayunas (mg/dL) ────────────────────────────
  let glMin = 70, glMax = 100;
  if (esDiabetico)    { glMax = 130; }
  if (esEmbarazada)   { glMax = 95;  }

  // ── Frecuencia cardíaca en reposo (lpm) ───────────────────
  let fcMin = 60, fcMax = 100;
  if (esAtleta)       { fcMin = 40; fcMax = 60; }
  else if (esActivo)  { fcMin = 50; fcMax = 70; }

  // ── Saturación de oxígeno (SpO2 %) ───────────────────────
  let spMin = 95, spMax = 100;

  // ── Temperatura corporal (°C) ─────────────────────────────
  let tempMin = 36.1, tempMax = 37.2;
  if (esEmbarazada)   { tempMax = 37.5; }

  // ── Peso saludable según IMC 18.5–24.9 ───────────────────
  const pesoMin = parseFloat((18.5 * Math.pow(estatura_cm / 100, 2)).toFixed(1));
  const pesoMax = parseFloat((24.9 * Math.pow(estatura_cm / 100, 2)).toFixed(1));

  return [
    // id_parametro 1 = Presión sistólica (ajustar según tu BD)
    { id_parametro: 1,  nombre: 'Presión sistólica',   rango_min: paMin,   rango_max: paMax,   unidad: 'mmHg' },
    { id_parametro: 2,  nombre: 'Presión diastólica',  rango_min: pdMin,   rango_max: pdMax,   unidad: 'mmHg' },
    { id_parametro: 3,  nombre: 'Glucosa',              rango_min: glMin,   rango_max: glMax,   unidad: 'mg/dL' },
    { id_parametro: 4,  nombre: 'Frecuencia cardíaca',  rango_min: fcMin,   rango_max: fcMax,   unidad: 'lpm' },
    { id_parametro: 5,  nombre: 'Saturación O₂',        rango_min: spMin,   rango_max: spMax,   unidad: '%' },
    { id_parametro: 6,  nombre: 'Temperatura',           rango_min: tempMin, rango_max: tempMax, unidad: '°C' },
    { id_parametro: 7,  nombre: 'Peso',                  rango_min: pesoMin, rango_max: pesoMax, unidad: 'kg' },
  ];
}

function calcularIMC(peso, estatura_cm) {
  const h = estatura_cm / 100;
  return peso / (h * h);
}

function categoriaIMC(imc) {
  if (imc < 18.5) return { texto: 'Bajo peso',     color: '#1565C0' };
  if (imc < 25)   return { texto: 'Normal',         color: '#2D7D5A' };
  if (imc < 30)   return { texto: 'Sobrepeso',      color: '#F0A500' };
  return              { texto: 'Obesidad',        color: '#E57373' };
}

function edadDesdeNacimiento(fechaStr) {
  if (!fechaStr) return null;
  const hoy  = new Date();
  const nac  = new Date(fechaStr);
  let edad   = hoy.getFullYear() - nac.getFullYear();
  const mes  = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

const ACTIVIDAD_LABEL = {
  sedentario: 'Sedentario',
  moderado:   'Moderado',
  activo:     'Activo',
  atleta:     'Atleta',
};
const CONDICION_LABEL = {
  ninguna:    'Ninguna',
  hipertenso: 'Hipertensión',
  diabetico:  'Diabetes',
  embarazada: 'Embarazo',
  cardiaco:   'Cardiopatía',
};

async function cargarBiometricos() {
  if (!App.token || App.usuario?.rol !== 'paciente') return;

  const resp = await api('mis_biometricos', {}, true);
  if (!resp.ok || !resp.biometricos) return;

  const b = resp.biometricos;
  mostrarResumenBiometricos(b);
}

function mostrarResumenBiometricos(b) {
  const vacios = $('#bio-vacio');

  if (!b || !b.estatura_cm) {
    if (vacios) vacios.style.display = 'block';
    $('#bio-rangos-preview') && ($('#bio-rangos-preview').style.display = 'none');
    return;
  }

  if (vacios) vacios.style.display = 'none';

  const imc     = calcularIMC(b.peso_kg, b.estatura_cm);
  const catIMC  = categoriaIMC(imc);

  const set = (id, val) => { const el = $(`#${id}`); if (el) el.textContent = val; };
  set('bio-estatura',  `${b.estatura_cm} cm`);
  set('bio-peso',      `${b.peso_kg} kg`);
  set('bio-imc',       `${imc.toFixed(1)} — ${catIMC.texto}`);
  set('bio-actividad', ACTIVIDAD_LABEL[b.actividad] || b.actividad || '—');
  set('bio-condicion', CONDICION_LABEL[b.condicion] || b.condicion || '—');

  // Mostrar rangos calculados como chips
  const rangosEl = $('#bio-rangos-preview');
  const chipsEl  = $('#bio-rangos-chips');
  if (rangosEl && chipsEl && b.rangos?.length) {
    chipsEl.innerHTML = b.rangos.map(r =>
      `<span style="font-size:.73rem;padding:3px 10px;border-radius:12px;
        border:1px solid var(--verde-borde);background:var(--verde-suave);color:var(--verde);">
        ${r.nombre}: ${r.rango_min}–${r.rango_max} ${r.unidad}
      </span>`
    ).join('');
    rangosEl.style.display = 'block';
  }
}

function configurarFormBiometricos() {
  const btnEditar   = $('#btn-editar-bio');
  const btnCancelar = $('#bio-btn-cancelar');
  const form        = $('#formulario-biometricos');
  const resumen     = $('#bio-resumen');
  const inputPeso   = $('#bio-input-peso');
  const inputEst    = $('#bio-input-estatura');
  const imcPreview  = $('#bio-imc-preview');
  const errorEl     = $('#bio-error');

  if (!form) return;

  /* Mostrar / ocultar formulario */
  const abrirForm = (datos) => {
    if (resumen)  resumen.style.display  = 'none';
    if (form)     form.style.display     = 'block';
    if (datos) {
      if (inputEst)  inputEst.value  = datos.estatura_cm || '';
      if (inputPeso) inputPeso.value = datos.peso_kg     || '';
      const selAct  = $('#bio-input-actividad');
      const selCond = $('#bio-input-condicion');
      if (selAct)  selAct.value  = datos.actividad || '';
      if (selCond) selCond.value = datos.condicion || 'ninguna';
    }
  };

  const cerrarForm = () => {
    if (form)    form.style.display    = 'none';
    if (resumen) resumen.style.display = 'block';
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
  };

  if (btnEditar) {
    btnEditar.addEventListener('click', async () => {
      /* Cargar datos actuales para pre-rellenar el form */
      const resp = await api('mis_biometricos', {}, true);
      abrirForm(resp?.biometricos || null);
    });
  }
  if (btnCancelar) btnCancelar.addEventListener('click', cerrarForm);

  /* IMC en tiempo real */
  const actualizarIMC = () => {
    const peso = parseFloat(inputPeso?.value);
    const est  = parseFloat(inputEst?.value);
    if (!peso || !est || est < 100 || est > 220) {
      if (imcPreview) imcPreview.style.display = 'none';
      return;
    }
    const imc = calcularIMC(peso, est);
    const cat = categoriaIMC(imc);
    const numEl = $('#bio-imc-num');
    const catEl = $('#bio-imc-cat');
    if (numEl) numEl.textContent = imc.toFixed(1);
    if (catEl) { catEl.textContent = cat.texto; catEl.style.color = cat.color; }
    if (imcPreview) imcPreview.style.display = 'block';
  };

  if (inputPeso) inputPeso.addEventListener('input', actualizarIMC);
  if (inputEst)  inputEst.addEventListener('input',  actualizarIMC);

  /* Envío del formulario */
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const estatura_cm = parseFloat(inputEst?.value);
    const peso_kg     = parseFloat(inputPeso?.value);
    const actividad   = $('#bio-input-actividad')?.value;
    const condicion   = $('#bio-input-condicion')?.value || 'ninguna';

    /* Validación */
    const mostrarError = (msg) => {
      if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
    };

    if (!estatura_cm || estatura_cm < 100 || estatura_cm > 220) {
      mostrarError('⚠️ Ingresa una estatura válida entre 100 y 220 cm.');
      return;
    }
    if (!peso_kg || peso_kg < 20 || peso_kg > 300) {
      mostrarError('⚠️ Ingresa un peso válido entre 20 y 300 kg.');
      return;
    }
    if (!actividad) {
      mostrarError('⚠️ Selecciona tu nivel de actividad física.');
      return;
    }

    if (errorEl) errorEl.style.display = 'none';

    /* Calcular rangos antes de enviar */
    const edad = edadDesdeNacimiento(App.usuario?.fecha_nacimiento);
    const sexo = App.usuario?.sexo || '';
    const rangos = calcularRangosPersonalizados({ estatura_cm, peso_kg, actividad, condicion, sexo, edad });

    const btn = form.querySelector('#bio-btn-guardar');
    setLoading(btn, true, 'Guardando…');

    const resp = await api('guardar_biometricos', {
      estatura_cm, peso_kg, actividad, condicion, rangos,
    }, true);

    setLoading(btn, false, '💾 Guardar y calcular rangos');

    if (!resp.ok) {
      if (errorEl) {
        errorEl.textContent = resp.error || 'No se pudieron guardar los datos.';
        errorEl.style.display = 'block';
      }
      mostrarToast('❌', 'Error', resp.error || 'No se pudieron guardar los datos.');
      return;
    }

    mostrarToast('✅', 'Datos biométricos guardados',
      `IMC: ${calcularIMC(peso_kg, estatura_cm).toFixed(1)} · ${rangos.length} rangos personalizados calculados.`, 5000);

    cerrarForm();
    mostrarResumenBiometricos({ estatura_cm, peso_kg, actividad, condicion, rangos });
  });
}

function configurarFormPerfil() {
  const btn = $('#btn-editar-perfil');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const telefono  = prompt('Nuevo teléfono:', App.usuario?.telefono || '');
    const direccion = prompt('Nueva dirección:', App.usuario?.direccion || '');
    if (telefono === null) return;

    const resp = await api('actualizar_perfil', { telefono, direccion }, true);
    if (resp.ok) {
      if (App.usuario) { App.usuario.telefono = telefono; App.usuario.direccion = direccion; }
      localStorage.setItem('tc_usuario', JSON.stringify(App.usuario));
      mostrarToast('✅', 'Perfil actualizado', 'Tus datos han sido guardados.');
      cargarPerfil();
    } else {
      mostrarToast('❌', 'Error', resp.error || 'No se pudo actualizar el perfil.');
    }
  });
}

/* ═══ INFORME PDF (En mejoras) ═══ */
function configurarInforme() {
  const btn = $('#btn-generar-informe');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    setLoading(btn, true, 'Generando…');
    const resp = await api('resumen_informe', {}, true);
    setLoading(btn, false, 'Descargar informe PDF');

    if (!resp.ok) {
      mostrarToast('❌', 'Error', resp.error || 'No se pudo generar el informe.');
      return;
    }

    // Construir HTML del informe y abrir en nueva pestaña para imprimir/guardar como PDF
    const p        = resp.paciente;
    const signos   = resp.signos   || [];
    const citas    = resp.citas    || [];
    const meds     = resp.medicamentos || [];
    const fecha    = resp.generado_en;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Informe — Te Cuido</title>
    <style>
      body{font-family:Arial,sans-serif;color:#1A2E25;padding:32px;max-width:800px;margin:auto;}
      h1{color:#2D7D5A;} h2{color:#2D7D5A;margin-top:24px;border-bottom:1px solid #C5E8D6;padding-bottom:6px;}
      table{width:100%;border-collapse:collapse;margin-top:12px;}
      th{background:#E8F5EE;color:#2D7D5A;text-align:left;padding:8px 10px;}
      td{padding:8px 10px;border-bottom:1px solid #eee;}
      .alerta{color:#E57373;font-weight:bold;}
      .footer{margin-top:40px;font-size:.8rem;color:#8AA89B;text-align:center;}
    </style></head><body>
    <h1>🌿 Te Cuido — Informe de salud</h1>
    <p>Generado: ${fecha}</p>

    <h2>Datos del paciente</h2>
    <table><tr><th>Nombre</th><td>${p?.nombres} ${p?.apellidos}</td></tr>
    <tr><th>Cédula</th><td>${p?.cedula}</td></tr>
    <tr><th>EPS</th><td>${p?.nombre_eps || '—'}</td></tr>
    <tr><th>Teléfono</th><td>${p?.telefono || '—'}</td></tr>
    <tr><th>Fecha de nac.</th><td>${p?.fecha_nacimiento || '—'}</td></tr></table>

    <h2>Últimos signos vitales</h2>
    <table><tr><th>Parámetro</th><th>Valor</th><th>Estado</th><th>Fecha</th></tr>
    ${signos.map(s => `<tr>
      <td>${s.nombre_parametro}</td>
      <td>${s.valor} ${s.unidad || ''}</td>
      <td class="${s.alerta ? 'alerta' : ''}">${s.alerta ? '⚠️ Fuera de rango' : '✓ Normal'}</td>
      <td>${s.fecha}</td>
    </tr>`).join('') || '<tr><td colspan="4">Sin registros</td></tr>'}
    </table>

    <h2>Próximas citas</h2>
    <table><tr><th>Motivo</th><th>Fecha</th><th>Hora</th><th>Estado</th></tr>
    ${citas.map(c => `<tr><td>${c.motivo || '—'}</td><td>${c.fecha}</td><td>${c.hora?.slice(0,5) || ''}</td><td>${c.estado}</td></tr>`).join('') || '<tr><td colspan="4">Sin citas</td></tr>'}
    </table>

    <h2>Medicamentos activos</h2>
    <table><tr><th>Medicamento</th><th>Dosis</th><th>Horario</th></tr>
    ${meds.map(m => `<tr><td>${m.nombre}</td><td>${m.dosis || '—'}</td><td>${m.horario || '—'}</td></tr>`).join('') || '<tr><td colspan="3">Sin medicamentos</td></tr>'}
    </table>

    <div class="footer">Te Cuido — Plataforma de salud digital · Este documento es informativo.</div>
    <script>window.onload=()=>window.print();<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    else mostrarToast('⚠️', 'Bloqueado', 'Permite las ventanas emergentes para generar el PDF.');
  });
}

/* ═══ ANIMACIONES ═════ */
function animarBarraProgreso() {
  const barra = $('.barra-progreso');
  if (!barra) return;
  barra.style.width = '0%';
  requestAnimationFrame(() => setTimeout(() => { barra.style.width = '65%'; }, 200));
}

function animarGrafico() {
  $$('.barra-relleno').forEach((b, i) => {
    const h = b.dataset.altura || '60';
    b.style.height = '0px';
    setTimeout(() => { b.style.height = `${h}px`; }, i * 80 + 200);
  });
}

/* ════ VALIDACIÓN EN TIEMPO REAL ═════ */
function configurarValidacion() {
  $$('input[type="email"]').forEach(input => {
    input.addEventListener('blur', () => {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value);
      input.style.borderColor = input.value && !ok ? 'var(--rojo-suave)' : '';
      if (input.value && !ok) mostrarToast('⚠️', 'Correo inválido', 'Formato de correo incorrecto.', 2500);
    });
  });

  $$('input[type="password"]').forEach(input => {
    input.addEventListener('blur', () => {
      if (input.value && input.value.length < 8) {
        input.style.borderColor = 'var(--rojo-suave)';
        mostrarToast('⚠️', 'Contraseña corta', 'Debe tener al menos 8 caracteres.', 2500);
      } else {
        input.style.borderColor = '';
      }
    });
  });
}

/* ═══ BÚSQUEDA ═════ */
function configurarBusqueda() {
  const input = $('#buscador');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    clearTimeout(input._timer);
    if (q.length >= 2) {
      input._timer = setTimeout(() =>
        mostrarToast('🔍', 'Buscando', `"${q}" — funcionalidad en desarrollo.`, 2000), 600);
    }
  });
}

/* ═══ TOASTS ════ */
function mostrarToast(icono, titulo, mensaje, duracion = 3500) {
  let cont = $('.toast-contenedor');
  if (!cont) {
    cont = document.createElement('div');
    cont.className = 'toast-contenedor';
    document.body.appendChild(cont);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="toast-icono">${icono}</span>
    <div class="toast-texto"><strong>${titulo}</strong><span>${mensaje}</span></div>`;
  cont.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = '.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duracion);
}

/* ══ UTILIDADES ════ */
function setLoading(btn, loading, texto) {
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = texto;
}

function hoy() {
  return new Date().toISOString().split('T')[0];
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return '—';
  try {
    const [anio, mes, dia] = fechaISO.split('T')[0].split('-');
    const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${parseInt(dia)} / ${meses[parseInt(mes)]} / ${anio}`;
  } catch { return fechaISO; }
}

function formatearFechaHora(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d) ? dt : d.toLocaleString('es-CO', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

/* ════ INICIO ═════ */

window.api          = api;
window.mostrarToast = mostrarToast;

document.addEventListener('DOMContentLoaded', async () => {
  // Registrar todos los módulos primero
  iniciarNavegacion();
  configurarBienvenida();
  configurarLogin();
  configurarSelectorTipoRegistro();
  configurarSelectorSexo();
  configurarRegistro();
  configurarCerrarSesion();
  configurarMensajes();
  configurarBusqueda();
  configurarValidacion();
  configurarFormSigno();
  configurarFormCita();
  configurarFormPerfil();
  configurarFormBiometricos();
  configurarInforme();

  // Navegar al dashboard de inmediato si hay sesión local guardada.
  // La validación del token se hace en paralelo sin bloquear la UI.
  if (restaurarSesion()) {
    actualizarUI();
    App._sesionVerificada = false;
    irA('pagina-dashboard');

    // Validar token en segundo plano — no bloquea la carga visual
    api('perfil', {}, true).then(check => {
      if (check.ok || check.status !== 401) {
        App._sesionVerificada = true;
      } else {
        limpiarSesion();
        App._sesionVerificada = false;
        mostrarToast('⚠️', 'Sesión expirada', 'Por favor vuelve a iniciar sesión.');
        irA('pagina-bienvenida');
      }
    });
  } else {
    App._sesionVerificada = false;
    irA('pagina-bienvenida');
  }

  console.log('✅ Te Cuido v2.0 — Conectado a te_cuido.');
});
