/** Vue.js **/

'use strict';

/* ── Parámetros de respaldo (se usan si el servidor no responde) ── */
const PARAMETROS_FALLBACK = [
  { id_parametro: 1, nombre_parametro: 'Glucosa en sangre',      unidad: 'mg/dL', rango_min: 70,  rango_max: 100, rango_fuente: 'global', rango_personalizado: 0 },
  { id_parametro: 2, nombre_parametro: 'Presión arterial',       unidad: 'mmHg',  rango_min: 90,  rango_max: 120, rango_fuente: 'global', rango_personalizado: 0 },
  { id_parametro: 3, nombre_parametro: 'Frecuencia cardíaca',    unidad: 'lpm',   rango_min: 60,  rango_max: 100, rango_fuente: 'global', rango_personalizado: 0 },
  { id_parametro: 4, nombre_parametro: 'Temperatura corporal',   unidad: '°C',    rango_min: 36,  rango_max: 37.5, rango_fuente: 'global', rango_personalizado: 0 },
  { id_parametro: 5, nombre_parametro: 'Saturación de oxígeno',  unidad: '%',     rango_min: 95,  rango_max: 100, rango_fuente: 'global', rango_personalizado: 0 },
  { id_parametro: 6, nombre_parametro: 'Peso corporal',          unidad: 'kg',    rango_min: null, rango_max: null, rango_fuente: 'global', rango_personalizado: 0 },
];

/* ── Iconos por tipo de parámetro ─────────────────────────── */
const ICONOS_PARAMETRO = {
  'glucosa':     'iconos/glucosa.png',
  'presión':     'iconos/presion.png',
  'peso':        'iconos/peso.png',
  'temperatura': 'iconos/temperatura.png',
  'frecuencia':  'iconos/corazon.png',
  'oxígeno':     'iconos/oxigeno.png',
  'default':     'iconos/corazon.png',
};

// Exponer para acceso desde iniciarVueSignos al cambiar de paciente
window.PARAMETROS_FALLBACK = PARAMETROS_FALLBACK;

function obtenerIcono(nombre) {
  const key = Object.keys(ICONOS_PARAMETRO)
    .find(k => nombre?.toLowerCase().includes(k));
  return ICONOS_PARAMETRO[key] || ICONOS_PARAMETRO['default'];
}

/* ── Clave de caché en localStorage (por usuario para evitar mezcla de cuentas) ── */
function getCacheKeys() {
  const uid = window.App?.usuario?.id || 'anonimo';
  return {
    historial:  `tc_signos_historial_${uid}`,
    parametros: `tc_signos_parametros_${uid}`,
  };
}
// Mantener alias legacy para no romper nada más
const CACHE_KEY_HISTORIAL  = 'tc_signos_historial';
const CACHE_KEY_PARAMETROS = 'tc_signos_parametros';

/* ── Paleta de colores por índice de parámetro ───────────── */
const PALETA_COLORES = [
  '#2d7d5a','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16',
];
function colorParametro(index) { return PALETA_COLORES[index % PALETA_COLORES.length]; }
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

/* ═══ TEMPLATE ═══ */
const TEMPLATE_SIGNOS = `
<div>

  <!-- ── Encabezado ──────────────────────────────────────── -->
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
    <div>
      <h2>Seguimiento de signos vitales</h2>
      <p style="color:var(--texto-suave);">Monitoreo en tiempo real de tu estado de salud</p>
    </div>
    <button class="btn-verde" style="display:flex;align-items:center;gap:6px;" @click="abrirFormNuevo">
      <img src="iconos/corazon.png" width="16" height="16" alt="registrar">
      + Nuevo registro
    </button>
  </div>

  <!-- ── Aviso sin sesión ─────────────────────────────────── -->
  <div v-if="sinSesion && !historial.length" style="background:rgba(239,68,68,.08);border:1.5px solid var(--rojo-suave);border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:.85rem;color:var(--rojo-suave);">
    ⚠️ <strong>Sesión expirada.</strong> Por favor cierra sesión e ingresa de nuevo.
  </div>

  <!-- ── Formulario de registro / edición ───────────────── -->
  <transition name="sv-fade">
    <div class="card sv-form-card" v-if="mostrarFormulario">
      <div class="card-header">
        <h3>{{ modoEdicion ? 'Editar registro' : 'Registrar signo vital' }}</h3>
        <span style="font-size:.8rem;color:var(--texto-suave);">
          {{ modoEdicion ? 'Modifica los datos del registro' : 'Ingresa tus valores de salud' }}
        </span>
      </div>

      <form @submit.prevent="modoEdicion ? actualizarSigno() : registrarSigno()" novalidate>

        <!-- Selector de parámetro -->
        <div class="campo">
          <label>Tipo de parámetro</label>
          <select v-model="form.id_parametro" required :disabled="modoEdicion">
            <option value="">Selecciona parámetro...</option>
            <option v-for="p in parametros" :key="p.id_parametro" :value="p.id_parametro">
              {{ p.nombre_parametro }} ({{ p.unidad || 'sin unidad' }})
            </option>
          </select>
          <span class="campo-info" v-if="rangoActual">
            Rango normal: {{ rangoActual.rango }}
            <span class="sv-rango-badge"
                  :class="'sv-rango-badge--' + (rangoActual.personalizado ? rangoActual.fuente : 'global')"
                  :title="'Fuente: ' + rangoActual.fuente">
              {{ rangoActual.personalizado
                  ? (rangoActual.fuente === 'calculado' ? '📐 personalizado'
                   : rangoActual.fuente === 'medico'    ? '🩺 médico'
                   :                                      '✏️ manual')
                  : '📋 referencia general' }}
            </span>
          </span>
        </div>

        <!-- Valor medido -->
        <div class="campo">
          <label>Valor medido</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="number" v-model.number="form.valor"
                   step="0.01" placeholder="Ej: 120" required style="flex:1;" />
            <span v-if="form.valor && estadoValor"
                  class="sv-badge" :class="'sv-badge--' + estadoValor.tipo">
              {{ estadoValor.etiqueta }}
            </span>
          </div>
        </div>

        <!-- Presión arterial sistólica / diastólica -->
        <div class="campo-fila"
             v-if="parametroSeleccionado && parametroSeleccionado.nombre_parametro?.toLowerCase().includes('presi')">
          <div class="campo">
            <label>Sistólica (mmHg)</label>
            <input type="number" v-model.number="form.sistolica" placeholder="Ej: 120" />
          </div>
          <div class="campo">
            <label>Diastólica (mmHg)</label>
            <input type="number" v-model.number="form.diastolica" placeholder="Ej: 80" />
          </div>
        </div>

        <!-- Observación -->
        <div class="campo">
          <label>Observación <span style="color:var(--texto-suave);font-weight:400;">(opcional)</span></label>
          <input type="text" v-model="form.observacion"
                 placeholder="Ej: Tomado en ayunas, después del ejercicio..." />
        </div>

        <!-- Error del servidor -->
        <div v-if="errorGuardado" class="sv-error-msg">⚠️ {{ errorGuardado }}</div>

        <!-- Botones -->
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button type="submit" class="btn-verde" style="flex:1;"
                  :disabled="guardando || guardadoExitoso"
                  :class="{ 'sv-btn-exito': guardadoExitoso }">
            <span v-if="guardando">⏳ Guardando...</span>
            <span v-else-if="guardadoExitoso">✅ ¡Guardado!</span>
            <span v-else>{{ modoEdicion ? '✏️ Actualizar' : '💾 Guardar registro' }}</span>
          </button>
          <button type="button" class="btn-ghost" @click="cerrarFormulario">Cancelar</button>
        </div>
      </form>
    </div>
  </transition>

  <!-- ── Tarjetas resumen últimos valores ────────────────── -->
  <div class="sv-resumen-grid" v-if="resumenParametros.length">
    <div class="sv-resumen-card"
         v-for="r in resumenParametros" :key="r.nombre"
         :class="{ 'sv-resumen-card--alerta': r.alerta, 'sv-resumen-card--destacado': parametroDestacadoId == r.id_parametro }"
         :style="parametroDestacadoId == r.id_parametro ? { '--color-leyenda': r.color, borderColor: r.color, boxShadow: '0 0 0 2px ' + r.color + '33' } : {}"
         style="cursor:pointer;" @click="toggleDestacado(r.id_parametro)">
      <div class="sv-resumen-icono"><img :src="r.icono" width="22" height="22" :alt="r.nombre" /></div>
      <div class="sv-resumen-datos">
        <span class="sv-resumen-nombre">{{ r.nombre }}</span>
        <span class="sv-resumen-valor">{{ r.valor }} <small>{{ r.unidad }}</small></span>
        <span class="sv-resumen-estado" :class="'sv-estado--' + (r.alerta ? 'alerta' : 'normal')">
          {{ r.alerta ? '⚠️ Fuera de rango' : '✓ Normal' }}
        </span>
      </div>
    </div>
  </div>

  <!-- ── Filtros ──────────────────────────────────────────── -->
  <div class="card sv-filtros-card">
    <div class="sv-filtros-row">
      <div class="campo" style="flex:2;margin:0;">
        <label style="font-size:.78rem;">Filtrar por parámetro</label>
        <select v-model="filtroParametro" style="padding:8px 10px;font-size:.82rem;">
          <option value="">Todos</option>
          <option v-for="p in parametros" :key="p.id_parametro" :value="p.id_parametro">
            {{ p.nombre_parametro }}
          </option>
        </select>
      </div>
      <div class="campo" style="flex:1;margin:0;">
        <label style="font-size:.78rem;">Solo alertas</label>
        <label class="sv-toggle">
          <input type="checkbox" v-model="filtroAlertas" />
          <span class="sv-toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>

  <!-- ── Gráfica unificada ────────────────────────────────── -->
  <div class="card sv-chart-card" v-if="datasetsGrafica.length" style="margin-top:16px;">
    <div class="card-header" style="flex-wrap:wrap;gap:6px;">
      <h3>{{ parametroDestacado ? 'Evolución — ' + parametroDestacado.nombre : 'Evolución general' }}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
        <button v-for="d in datasetsGrafica" :key="d.id_parametro"
                class="sv-leyenda-btn"
                :class="{ 'sv-leyenda-btn--activo': parametroDestacadoId == d.id_parametro, 'sv-leyenda-btn--tenue': parametroDestacadoId && parametroDestacadoId != d.id_parametro }"
                :style="{ '--color-leyenda': d.color }"
                @click="toggleDestacado(d.id_parametro)">
          <span class="sv-leyenda-dot"></span>{{ d.nombre }}
        </button>
        <button v-if="parametroDestacadoId" class="sv-leyenda-reset"
                @click="parametroDestacadoId = null" title="Ver todos">✕</button>
      </div>
    </div>
    <canvas ref="canvasGrafica" height="200"></canvas>
  </div>

  <!-- ── Historial de registros ───────────────────────────── -->
  <div class="card" style="margin-top:20px;">
    <div class="card-header">
      <h3>Historial de registros</h3>
      <span style="font-size:.82rem;color:var(--texto-suave);">
        {{ registrosFiltrados.length }} registro{{ registrosFiltrados.length !== 1 ? 's' : '' }}
        <span v-if="desdeCache" style="color:var(--texto-suave);margin-left:6px;">(caché local)</span>
      </span>
    </div>

    <!-- Cargando (solo cuando no hay caché ni registros) -->
    <div v-if="cargando && !historial.length" class="sv-estado-msg">
      <span class="sv-spinner"></span> Cargando registros...
    </div>

    <!-- Sin resultados -->
    <div v-else-if="!registrosFiltrados.length" class="sv-estado-msg">
      <img src="iconos/corazon.png" width="32" height="32" alt="sin datos"
           style="opacity:.4;margin-bottom:8px;" />
      <p>{{ historial.length ? 'No hay registros con ese filtro.' : 'Aún no tienes registros de signos vitales.' }}</p>
      <button class="btn-verde" @click="abrirFormNuevo" style="margin-top:10px;">Registrar ahora</button>
    </div>

    <!-- Lista de registros -->
    <div v-else class="seguimiento-modulos">
      <div class="modulo-item sv-item"
           v-for="r in registrosFiltrados" :key="r.id_registro"
           :class="{ 'sv-item--alerta': r.alerta == 1 }">
        <div class="modulo-icono icono-svg">
          <img src="iconos/corazon.png" width="18" height="18" alt="signo"
               :style="{ filter: r.alerta == 1 ? 'hue-rotate(320deg) saturate(2)' : 'none' }" />
        </div>
        <div class="modulo-info" style="flex:1;">
          <strong>{{ r.nombre_parametro }}</strong>
          <p>
            <span class="sv-valor-chip" :class="r.alerta == 1 ? 'sv-chip--alerta' : 'sv-chip--ok'">
              {{ r.valor }} {{ r.unidad || '' }}
            </span>
            {{ r.alerta == 1 ? '⚠️ Fuera de rango' : '✓ Normal' }}
          </p>
          <small style="color:var(--texto-suave);">📅 {{ formatearFecha(r.fecha) }}</small>
          <small v-if="r.observacion" style="color:var(--texto-suave);display:block;">💬 {{ r.observacion }}</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          <button class="btn-ghost sv-btn-accion" @click="abrirEdicion(r)" title="Editar">✏️</button>
          <button class="btn-ghost sv-btn-accion sv-btn-eliminar" @click="confirmarEliminar(r)" title="Eliminar">🗑️</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Modal de confirmación eliminar ──────────────────── -->
  <transition name="sv-fade">
    <div v-if="modalEliminar" class="sv-modal-overlay" @click.self="modalEliminar = null">
      <div class="sv-modal">
        <h3 style="margin-bottom:8px;">¿Eliminar este registro?</h3>
        <p style="color:var(--texto-suave);font-size:.9rem;margin-bottom:16px;">
          <strong>{{ modalEliminar.nombre_parametro }}</strong>: {{ modalEliminar.valor }} {{ modalEliminar.unidad }}<br>
          <span style="font-size:.8rem;">📅 {{ formatearFecha(modalEliminar.fecha) }}</span>
        </p>
        <p style="color:var(--rojo-suave);font-size:.82rem;margin-bottom:16px;">⚠️ Esta acción no se puede deshacer.</p>
        <div style="display:flex;gap:10px;">
          <button class="btn-rojo" style="flex:1;" @click="eliminarSigno" :disabled="eliminando">
            {{ eliminando ? '⏳ Eliminando...' : '🗑️ Sí, eliminar' }}
          </button>
          <button class="btn-ghost" @click="modalEliminar = null">Cancelar</button>
        </div>
      </div>
    </div>
  </transition>

</div>
`;

/* ═══ Desactivar animaciones globales de Chart.js (evita loop de color.esm.js) ═══ */
if (typeof Chart !== 'undefined') {
  Chart.defaults.animation = false;
  Chart.defaults.animations = {};
  Chart.defaults.transitions = {};
}

/* ═══ FUNCIÓN PRINCIPAL ════ */
/* Desactivar animaciones globales de Chart.js (evita loop color.esm.js) */
if (typeof Chart !== 'undefined') {
  Chart.defaults.animation   = false;
  Chart.defaults.animations  = {};
  Chart.defaults.transitions = {};
}

function iniciarVueSignos() {
  try {
    const mountPoint = document.getElementById('app-signos');
    if (!mountPoint) { console.warn('[Vue] #app-signos no encontrado'); return; }
    if (typeof Vue === 'undefined') { console.error('[Vue] Vue.js no cargado'); return; }

    // Si Vue ya está montado, limpiar datos del paciente anterior y recargar
    if (window._vueSignosApp) {
      setTimeout(() => {
        const vue = window._vueSignosApp;
        if (!vue) return;

        // ── Limpiar estado del paciente anterior en memoria ──
        vue.historial          = [];
        vue.parametros         = [];
        vue.desdeCache         = false;
        vue.sinSesion          = false;
        vue.cargando           = false;
        vue.mostrarFormulario  = false;
        vue.filtroParametro    = '';
        vue.filtroAlertas      = false;
        vue.parametroDestacadoId = null;

        // Destruir gráfica anterior para que no muestre datos del otro paciente
        if (vue._chartInstance) {
          try { vue._chartInstance.destroy(); } catch(e) {}
          vue._chartInstance = null;
        }

        // Cargar caché y datos del nuevo paciente
        vue.cargarCacheLocal();
        if (!vue.parametros.length) {
          const { PARAMETROS_FALLBACK: fb } = window;
          if (fb) vue.parametros = [...fb];
        }
        if (vue.historial.length) vue.pedirGrafica();

        // Sincronizar con servidor
        const cargarConToken = (n) => {
          if (window.App?.token) {
            vue.cargarParametros().catch(() => {});
            vue.cargarHistorial().catch(() => {});
          } else if (n > 0) {
            setTimeout(() => cargarConToken(n - 1), 200);
          }
        };
        cargarConToken(15);

      }, 80);
      return;
    }

    mountPoint.innerHTML = '';

    const appSignos = Vue.createApp({

      template: TEMPLATE_SIGNOS,

      data() {
        return {
          cargando:          false,
          guardando:         false,
          guardadoExitoso:   false,
          eliminando:        false,
          errorGuardado:     '',
          mostrarFormulario: false,
          modoEdicion:       false,
          registroEnEdicion: null,
          modalEliminar:     null,
          desdeCache:        false,
          sinSesion:         false,   // true si el servidor rechaza la petición
          parametros:        [],
          historial:         [],
          form: {
            id_parametro: '',
            valor:        null,
            sistolica:    null,
            diastolica:   null,
            observacion:  '',
          },
          filtroParametro:      '',
          filtroAlertas:        false,
          parametroDestacadoId: null,
          _chartInstance:       null,
          _graficaTimer:        null,
          _renderizando:        false,
        };
      },

      computed: {
        parametroSeleccionado() {
          if (!this.form.id_parametro) return null;
          return this.parametros.find(p => p.id_parametro == this.form.id_parametro) || null;
        },

        rangoActual() {
          const p = this.parametroSeleccionado;
          if (!p || (p.rango_min == null && p.rango_max == null)) return null;
          const rango  = `${p.rango_min} – ${p.rango_max} ${p.unidad || ''}`.trim();
          const fuente = p.rango_fuente || 'global';
          return { rango, fuente, personalizado: !!p.rango_personalizado };
        },

        estadoValor() {
          const p   = this.parametroSeleccionado;
          const val = this.form.valor;
          if (!p || val === null || val === '') return null;
          if (p.rango_min == null && p.rango_max == null) return { tipo: 'sin-ref', etiqueta: 'Sin referencia' };
          const ok = (p.rango_min == null || val >= parseFloat(p.rango_min)) &&
                     (p.rango_max == null || val <= parseFloat(p.rango_max));
          return ok ? { tipo: 'ok', etiqueta: '✓ Normal' } : { tipo: 'alerta', etiqueta: '⚠️ Fuera de rango' };
        },

        registrosFiltrados() {
          return this.historial.filter(r => {
            const passParam  = !this.filtroParametro || String(r.id_parametro) === String(this.filtroParametro);
            const passAlerta = !this.filtroAlertas   || r.alerta == 1;
            return passParam && passAlerta;
          });
        },

        resumenParametros() {
          const map = {};
          this.historial.forEach(r => {
            if (!map[r.nombre_parametro]) {
              map[r.nombre_parametro] = {
                id_parametro: r.id_parametro,
                nombre: r.nombre_parametro,
                valor:  r.valor,
                unidad: r.unidad || '',
                alerta: r.alerta == 1,
                icono:  obtenerIcono(r.nombre_parametro),
              };
            }
          });
          return Object.values(map).map((item, idx) => ({
            ...item,
            color: colorParametro(idx),
          }));
        },

        datasetsGrafica() {
          const grupos = {};
          const orden  = [];
          [...this.historial].reverse().forEach(r => {
            const id = String(r.id_parametro);
            if (!grupos[id]) {
              orden.push(id);
              grupos[id] = { id_parametro: r.id_parametro, nombre: r.nombre_parametro, unidad: r.unidad || '', labels: [], valores: [], alertas: [] };
            }
            if (grupos[id].labels.length < 10) {
              grupos[id].labels.push(this.formatearFecha(r.fecha, true));
              grupos[id].valores.push(parseFloat(r.valor));
              grupos[id].alertas.push(r.alerta == 1);
            }
          });
          return orden.map((id, idx) => ({ ...grupos[id], color: colorParametro(idx) }));
        },

        parametroDestacado() {
          if (!this.parametroDestacadoId) return null;
          return this.datasetsGrafica.find(d => d.id_parametro == this.parametroDestacadoId) || null;
        },

        datosGrafica() {
          // SOLO depende del historial — parametroDestacadoId fuera para evitar loop
          return this.datasetsGrafica.map(d => d.id_parametro).join(',');
        },
      },

      watch: {
        datosGrafica(nuevoVal, viejoVal) {
          // Solo redibujar cuando cambia el historial real (no el destacado)
          if (nuevoVal === viejoVal) return;
          const sec = document.getElementById('pagina-seguimiento');
          if (sec && sec.classList.contains('pagina-activa')) {
            this.pedirGrafica();
          }
        },
        mostrarFormulario(v) {
          if (v && !this.parametros.length) this.cargarParametros();
        },
      },

      methods: {

        toggleDestacado(idParametro) {
          this.parametroDestacadoId =
            this.parametroDestacadoId == idParametro ? null : idParametro;
          // Llamar renderizarGrafica directamente — NO pedirGrafica —
          // para que el watcher de datosGrafica no entre en loop
          this.$nextTick(() => {
            const canvas = this.$refs.canvasGrafica;
            if (canvas) this.renderizarGrafica(canvas);
          });
        },

        /* ── CACHÉ LOCAL ──────────────────────────────────── */
        guardarCacheLocal() {
          try {
            const keys = getCacheKeys();
            localStorage.setItem(keys.historial,  JSON.stringify(this.historial));
            localStorage.setItem(keys.parametros, JSON.stringify(this.parametros));
          } catch(e) {}
        },

        cargarCacheLocal() {
          try {
            const keys = getCacheKeys();
            const h = localStorage.getItem(keys.historial);
            const p = localStorage.getItem(keys.parametros);
            if (h) { this.historial  = JSON.parse(h); this.desdeCache = true; }
            if (p) { this.parametros = JSON.parse(p); }
          } catch(e) {}
        },

        /* ── CARGA DEL SERVIDOR ─────────────────────────── */
        async cargarParametros() {
          try {
            const resp = await window.api('parametros', {}, true);
            if (resp?.ok && resp.parametros?.length) {
              this.parametros = resp.parametros;
              this.sinSesion  = false;
              this.guardarCacheLocal();
            } else if (!this.parametros.length) {
              // Sin respuesta válida y sin caché → usar fallback
              this.parametros = PARAMETROS_FALLBACK;
              this.sinSesion  = true;
            }
          } catch(e) {
            if (!this.parametros.length) this.parametros = PARAMETROS_FALLBACK;
            this.sinSesion = true;
          }
        },

        async cargarHistorial() {
          this.cargando = true;
          try {
            const resp = await window.api('historial_signos', { limite: 50 }, true);
            this.cargando = false;
            if (resp?.ok) {
              this.historial  = resp.registros || [];
              this.desdeCache = false;
              this.sinSesion  = false;
              this.guardarCacheLocal();
              // pedirGrafica() se activará vía el watcher datosGrafica cuando la sección sea visible
            } else {
              this.sinSesion = true;
            }
          } catch(e) {
            this.cargando  = false;
            this.sinSesion = true;
          }
        },

        /* ── FORMULARIO ──────────────────────────────────── */
        abrirFormNuevo() {
          this.modoEdicion       = false;
          this.registroEnEdicion = null;
          this.resetForm();
          this.mostrarFormulario = true;
        },

        abrirEdicion(registro) {
          this.modoEdicion       = true;
          this.registroEnEdicion = registro;
          this.form = {
            id_parametro: registro.id_parametro,
            valor:        registro.valor,
            sistolica:    registro.sistolica  || null,
            diastolica:   registro.diastolica || null,
            observacion:  registro.observacion || '',
          };
          this.mostrarFormulario = true;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        cerrarFormulario() {
          this.mostrarFormulario = false;
          this.modoEdicion       = false;
          this.registroEnEdicion = null;
          this.resetForm();
        },

        /* ── CREAR ──────────────────────────────────────── */
        async registrarSigno() {
          if (!this.form.id_parametro) {
            window.mostrarToast('⚠️', 'Parámetro requerido', 'Selecciona el tipo de signo vital.');
            return;
          }
          if (this.form.valor === null || this.form.valor === '' || isNaN(this.form.valor)) {
            window.mostrarToast('⚠️', 'Valor requerido', 'Ingresa un valor numérico válido.');
            return;
          }

          const parametro = this.parametros.find(p => p.id_parametro == this.form.id_parametro);
          const payload   = {
            id_parametro: parseInt(this.form.id_parametro),
            valor:        parseFloat(this.form.valor),
            observacion:  (this.form.observacion || '').trim(),
          };
          if (this.form.sistolica  != null && this.form.sistolica  !== '') payload.sistolica  = parseFloat(this.form.sistolica);
          if (this.form.diastolica != null && this.form.diastolica !== '') payload.diastolica = parseFloat(this.form.diastolica);

          /* ── Verificar rango localmente para la alerta visual ── */
          let alertaLocal = false;
          if (parametro && parametro.rango_min != null && parametro.rango_max != null) {
            alertaLocal = payload.valor < parseFloat(parametro.rango_min) || payload.valor > parseFloat(parametro.rango_max);
          }

          /* ── Guardar en servidor si hay sesión ── */
          if (window.App?.token) {
            this.guardando     = true;
            this.errorGuardado = '';
            let resp;
            try {
              resp = await window.api('registrar_signo', payload, true);
            } catch(err) {
              resp = null;
            }
            this.guardando = false;

            if (resp?.ok) {
              alertaLocal = !!resp.alerta;
              if (alertaLocal) {
                window.mostrarToast('⚠️', '¡Alerta de salud!', 'Tu valor está fuera del rango normal. Consulta a tu médico.', 7000);
              } else {
                window.mostrarToast('✅', 'Registro guardado', '¡Signo vital archivado correctamente!');
              }

              /* ── Insertar optimistamente con id real del servidor ── */
              this.guardadoExitoso = true;
              if (parametro) {
                this.historial.unshift({
                  id_registro:      resp.id || Date.now(),
                  id_parametro:     payload.id_parametro,
                  nombre_parametro: parametro.nombre_parametro,
                  unidad:           parametro.unidad || '',
                  valor:            payload.valor,
                  observacion:      payload.observacion,
                  alerta:           alertaLocal ? 1 : 0,
                  fecha:            new Date().toISOString(),
                });
                this.guardarCacheLocal();
              }

              /* ── Recargar desde servidor para sincronizar estado real ── */
              setTimeout(() => { this.cargarHistorial().catch(() => {}); }, 1200);

            } else {
              /* ── Error en servidor: NO insertar registro falso, mostrar error ── */
              const msg = resp?.error || 'No se pudo guardar en el servidor.';
              this.errorGuardado = msg;
              window.mostrarToast('❌', 'Error al guardar', msg, 5000);
              setTimeout(() => { this.errorGuardado = ''; }, 5000);
              return; // Salir sin cerrar el formulario para que el usuario reintente
            }
          } else {
            /* ── Sin sesión: guardar sólo local ── */
            window.mostrarToast('✅', 'Guardado local', 'Registro guardado en este dispositivo.');
            this.guardadoExitoso = true;
            if (parametro) {
              this.historial.unshift({
                id_registro:      Date.now(),
                id_parametro:     payload.id_parametro,
                nombre_parametro: parametro.nombre_parametro,
                unidad:           parametro.unidad || '',
                valor:            payload.valor,
                observacion:      payload.observacion,
                alerta:           alertaLocal ? 1 : 0,
                fecha:            new Date().toISOString(),
              });
              this.guardarCacheLocal();
            }
          }

          setTimeout(() => {
            this.guardadoExitoso   = false;
            this.mostrarFormulario = false;
            this.resetForm();
          }, 900);
        },

        /* ── EDITAR ─────────────────────────────────────── */
        async actualizarSigno() {
          if (this.form.valor === null || this.form.valor === '' || isNaN(this.form.valor)) {
            window.mostrarToast('⚠️', 'Valor requerido', 'Ingresa un valor numérico válido.');
            return;
          }

          const payload = {
            id_registro:  this.registroEnEdicion.id_registro,
            valor:        parseFloat(this.form.valor),
            observacion:  (this.form.observacion || '').trim(),
          };
          if (this.form.sistolica  != null) payload.sistolica  = parseFloat(this.form.sistolica);
          if (this.form.diastolica != null) payload.diastolica = parseFloat(this.form.diastolica);

          if (window.App?.token) {
            this.guardando = true;
            try {
              const resp = await window.api('editar_signo', payload, true);
              this.guardando = false;
              if (!resp?.ok) {
                window.mostrarToast('⚠️', 'Error', resp?.error || 'No se pudo actualizar en el servidor.');
              }
            } catch(e) { this.guardando = false; }
          }

          this.guardadoExitoso = true;
          window.mostrarToast('✅', 'Registro actualizado', 'El signo vital fue modificado.');

          const idx = this.historial.findIndex(r => r.id_registro == this.registroEnEdicion.id_registro);
          if (idx !== -1) {
            this.historial[idx] = { ...this.historial[idx], valor: payload.valor, observacion: payload.observacion };
            this.guardarCacheLocal();
          }

          setTimeout(() => {
            this.guardadoExitoso   = false;
            this.mostrarFormulario = false;
            this.modoEdicion       = false;
            this.registroEnEdicion = null;
            this.resetForm();
          }, 900);
        },

        /* ── ELIMINAR ───────────────────────────────────── */
        confirmarEliminar(registro) { this.modalEliminar = registro; },

        async eliminarSigno() {
          if (!this.modalEliminar) return;

          if (window.App?.token) {
            this.eliminando = true;
            try {
              await window.api('eliminar_signo', { id_registro: this.modalEliminar.id_registro }, true);
            } catch(e) {}
            this.eliminando = false;
          }

          window.mostrarToast('✅', 'Registro eliminado', 'El registro fue eliminado del historial.');
          this.historial     = this.historial.filter(r => r.id_registro != this.modalEliminar.id_registro);
          this.guardarCacheLocal();
          this.modalEliminar = null;
        },

        /* ── UTILIDADES ─────────────────────────────────── */
        resetForm() {
          this.form = { id_parametro: '', valor: null, sistolica: null, diastolica: null, observacion: '' };
          this.errorGuardado = '';
        },

        /* ── Dibuja la gráfica de forma segura ── */

        pedirGrafica(intentos = 25) {
          if (this._graficaPendiente) return;   // ya hay un intento en curso
          this._graficaPendiente = true;
          const intentar = (n) => {
            // Buscar el canvas directamente en el DOM, sin depender del ref de Vue
            const canvas = document.querySelector('#app-signos canvas');
            if (canvas && typeof canvas.getContext === 'function') {
              const ancho = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 0;
              if (ancho > 0) {
                this._graficaPendiente = false;
                this.renderizarGrafica(canvas);
                return;
              }
            }
            if (n > 0) {
              setTimeout(() => intentar(n - 1), 150);
            } else {
              this._graficaPendiente = false;
            }
          };
          // Primer intento en el siguiente frame de pintura
          requestAnimationFrame(() => intentar(intentos));
        },

        renderizarGrafica(canvasParam) {
          // Guard anti-recursión (evita que toggleDestacado llame renderizarGrafica
          // mientras ya está ejecutándose)
          if (this._renderizando) return;
          this._renderizando = true;
          try {
            this._renderizarInterno(canvasParam);
          } finally {
            this._renderizando = false;
          }
        },

        _renderizarInterno(canvasParam) {
          const canvas = canvasParam || this.$refs.canvasGrafica;
          if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
          if (!canvas.isConnected) return;                          // canvas ya fuera del DOM
          try { if (!canvas.getContext('2d')) return; } catch(e) { return; }

          const datasets = this.datasetsGrafica;
          if (!datasets.length) return;

          // Destruir instancia anterior — Chart.js 4.x requiere destroy() antes de new Chart()
          if (this._chartInstance) {
            try { this._chartInstance.destroy(); } catch(e) {}
            this._chartInstance = null;
          }
          if (!canvas.isConnected) return;  // segundo check tras destroy

          const destacadoId  = this.parametroDestacadoId;
          const hayDestacado = destacadoId != null;

          const labelsBase = hayDestacado
            ? (datasets.find(d => String(d.id_parametro) === String(destacadoId))?.labels || [])
            : (() => { const s = new Set(); datasets.forEach(d => d.labels.forEach(l => s.add(l))); return [...s].sort(); })();

          const chartDatasets = datasets.map(d => {
            const esDestacado = String(d.id_parametro) === String(destacadoId);
            const tenue       = hayDestacado && !esDestacado;
            const rgb         = hexToRgb(d.color);
            const alpha       = tenue ? 0.15 : 0.85;
            const data        = tenue
              ? labelsBase.map(l => { const i = d.labels.indexOf(l); return i !== -1 ? d.valores[i] : null; })
              : d.valores;
            return {
              label:                d.nombre,
              data,
              borderColor:          `rgba(${rgb},${alpha})`,
              backgroundColor:      `rgba(${rgb},${tenue ? 0.02 : 0.10})`,
              pointBackgroundColor: d.alertas.map(a =>
                tenue ? `rgba(${rgb},0.15)` : (a ? `rgba(229,115,115,${alpha})` : `rgba(${rgb},${alpha})`)),
              pointRadius:      4,
              pointHoverRadius: 5,
              pointHitRadius:   12,
              borderWidth:      esDestacado ? 2.5 : (tenue ? 1 : 1.8),
              tension:          0.4,
              fill:             false,
              _idParametro:     d.id_parametro,
              _unidad:          d.unidad,
            };
          });

          this._chartInstance = new Chart(canvas, {
            type: 'line',
            data: { labels: labelsBase, datasets: chartDatasets },
            options: {
              animation:            false,   // desactiva animaciones — evita loop de color.esm.js
              responsive:           true,
              maintainAspectRatio:  true,
              spanGaps:             true,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend:  { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} ${ctx.dataset._unidad || ''}` } },
              },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: false },
              },
              onClick: (e, elements) => {
                if (!elements || !elements.length) return;
                const ds = chartDatasets[elements[0].datasetIndex];
                if (!ds || ds._idParametro == null) return;
                const id = ds._idParametro;
                // setTimeout 0: esperar a que Chart.js termine de procesar el clic
                // antes de que toggleDestacado cambie estado y llame renderizarGrafica
                setTimeout(() => { this.toggleDestacado(id); }, 0);
              },
            },
          });
        },

        formatearFecha(fechaISO, corto = false) {
          if (!fechaISO) return '';
          const d = new Date(fechaISO);
          if (isNaN(d)) return fechaISO;
          if (corto) return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
          return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        },
      },

      /* ── Ciclo de vida ───────────────────────────────────── */
      mounted() {
        /* 1. Mostrar caché local de inmediato */
        this.cargarCacheLocal();

        /* 2. Si no hay parámetros (ni caché ni servidor aún), usar fallback local */
        if (!this.parametros.length) {
          this.parametros = [...PARAMETROS_FALLBACK];
        }

        /* 3. Si ya hay datos en caché, dibujar gráfica inmediatamente
              (la sección ya es visible porque mounted() se llama desde irA) */
        if (this.historial.length) {
          this.pedirGrafica();
        }

        /* 4. Sincronizar con el servidor — esperar token si aún no está listo */
        const cargarConToken = (intentos) => {
          if (window.App?.token) {
            this.cargarParametros().catch(() => {});
            this.cargarHistorial().catch(() => {});
          } else if (intentos > 0) {
            setTimeout(() => cargarConToken(intentos - 1), 200);
          }
        };
        cargarConToken(15); // espera hasta 3 segundos
      },

      beforeUnmount() {
        if (this._graficaTimer)  { clearTimeout(this._graficaTimer); this._graficaTimer = null; }
        if (this._chartInstance) { try { this._chartInstance.destroy(); } catch(e) {} this._chartInstance = null; }
      },

    });

    window._vueSignosApp = appSignos.mount('#app-signos');
    console.log('[Vue] Signos vitales v2.2 montado ✓');

  } catch(err) {
    console.error('[Vue] Error al montar:', err);
  }
}

/* ── Hook global para script.js ──────────────────────────── */
window.notificarNuevoSigno = function(registroOptimista) {
  const vue = window._vueSignosApp;
  if (!vue) return;
  if (registroOptimista) { vue.historial.unshift(registroOptimista); vue.guardarCacheLocal(); }
  vue.cargarHistorial().catch(() => {});
};
