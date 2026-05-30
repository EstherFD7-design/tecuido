/* vue-modulos.js — Módulos Vue 3 */

'use strict';

/* ═════════ SECCIÓN 1 — SIGNOS VITALES ══════════ */
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

/* ════════ SECCIÓN 2 — CITAS MÉDICAS ════════════════ */


/** Lista de especialidades médicas comunes */
const ESPECIALIDADES = [
  'Medicina general',
  'Cardiología',
  'Neurología',
  'Ortopedia',
  'Pediatría',
  'Geriatría',
  'Endocrinología',
  'Diabetología',
  'Nutrición',
  'Psicología',
  'Oftalmología',
  'Odontología',
  'Otro / especificar',
];

/* ── Clave de caché de citas (por usuario, igual que signos vitales) ── */
function getCitasCacheKey() {
  const uid = window.App?.usuario?.id || 'anonimo';
  return `tc_citas_${uid}`;
}

/** Citas de ejemplo para mostrar si la API no responde */
const CITAS_FALLBACK = [
  {
    id_cita:  1,
    fecha:    '2026-06-10',
    hora:     '10:00:00',
    motivo:   'Control con internista',
    estado:   'pendiente',
  },
  {
    id_cita:  2,
    fecha:    '2026-05-20',
    hora:     '14:30:00',
    motivo:   'Revisión cardiología',
    estado:   'completada',
  },
];

/** Nombres cortos de los meses para mostrar en tarjetas */
const MESES_CORTOS = [
  'ene','feb','mar','abr','may','jun',
  'jul','ago','sep','oct','nov','dic',
];

/* ═════ TEMPLATE DEL COMPONENTE ═════════ */

const TEMPLATE_CITAS = `
<div class="citas-vue-root">

  <!-- ── Encabezado de sección ─────────────────── -->
  <div class="citas-header">
    <div>
      <h2>Citas médicas</h2>
      <p style="color:var(--texto-suave);">Agenda y consulta tus próximas citas</p>
    </div>
    <!-- Botón que abre el formulario de nueva cita -->
    <button class="btn-verde" @click="abrirFormulario" aria-label="Agendar nueva cita">
      <img src="iconos/calendario.png" width="16" height="16" alt="" />
      + Nueva cita
    </button>
  </div>

  <!-- ── Aviso de modo sin conexión ────────────── -->
  <div
    v-if="modoFallback"
    class="citas-aviso-fallback"
    role="alert"
  >
    ⚠️ <strong>Sin conexión.</strong>
    Mostrando datos de ejemplo. Los cambios no se guardarán hasta reconectar.
  </div>

  <!-- ── Formulario: agendar / editar cita ─────── -->
  <transition name="citas-slide">
    <div v-if="mostrarFormulario" class="citas-card" role="dialog" aria-modal="true" aria-label="Formulario de cita">

      <h3 class="citas-card-titulo">
        {{ editando ? 'Editar cita' : 'Agendar nueva cita' }}
      </h3>

      <!-- FECHA Y HORA en una fila -->
      <div class="citas-fila-doble">
        <div class="campo">
          <label for="cita-fecha-v">Fecha <span class="obligatorio">*</span></label>
          <input
            id="cita-fecha-v"
            type="date"
            v-model="form.fecha"
            :min="hoyISO"
            required
            aria-required="true"
          />
          <!-- Mensaje de error de validación -->
          <span v-if="errores.fecha" class="citas-error" role="alert">{{ errores.fecha }}</span>
        </div>
        <div class="campo">
          <label for="cita-hora-v">Hora <span class="obligatorio">*</span></label>
          <input
            id="cita-hora-v"
            type="time"
            v-model="form.hora"
            required
            aria-required="true"
          />
          <span v-if="errores.hora" class="citas-error" role="alert">{{ errores.hora }}</span>
        </div>
      </div>

      <!-- ESPECIALIDAD: lista desplegable -->
      <div class="campo">
        <label for="cita-especialidad-v">Especialidad <span class="obligatorio">*</span></label>
        <select id="cita-especialidad-v" v-model="form.especialidad" aria-required="true">
          <option value="" disabled>Selecciona una especialidad</option>
          <option v-for="esp in especialidades" :key="esp" :value="esp">{{ esp }}</option>
        </select>
        <span v-if="errores.especialidad" class="citas-error" role="alert">{{ errores.especialidad }}</span>
      </div>

      <!-- MOTIVO: texto libre, aparece si elige "Otro" -->
      <div class="campo" v-if="form.especialidad === 'Otro / especificar'">
        <label for="cita-motivo-v">Especifica el motivo</label>
        <input
          id="cita-motivo-v"
          type="text"
          v-model="form.motivoOtro"
          placeholder="Ej: Revisión post-operatoria"
          maxlength="120"
        />
      </div>

      <!-- NOTAS ADICIONALES -->
      <div class="campo">
        <label for="cita-notas-v">Notas adicionales (opcional)</label>
        <textarea
          id="cita-notas-v"
          v-model="form.notas"
          placeholder="Ej: Llevar resultados de laboratorio"
          rows="2"
          maxlength="300"
          style="resize:vertical;"
        ></textarea>
      </div>

      <!-- BOTONES de acción -->
      <div class="citas-botones">
        <button class="btn-ghost" @click="cerrarFormulario" :disabled="guardando">
          Cancelar
        </button>
        <button class="btn-verde" @click="guardarCita" :disabled="guardando" aria-live="polite">
          <span v-if="guardando">Guardando…</span>
          <span v-else>{{ editando ? 'Guardar cambios' : 'Agendar cita' }}</span>
        </button>
      </div>

    </div><!-- /formulario -->
  </transition>

  <!-- ── Estado de carga ────────────────────────── -->
  <div v-if="cargando" class="citas-cargando" aria-live="polite">
    <div class="citas-spinner" aria-hidden="true"></div>
    <span>Cargando citas…</span>
  </div>

  <!-- ── Lista de citas ─────────────────────────── -->
  <div v-else>

    <!-- Filtros de estado (Todas / Próximas / Pasadas) -->
    <div class="citas-filtros" role="group" aria-label="Filtrar citas">
      <button
        v-for="f in filtros"
        :key="f.valor"
        class="citas-filtro-btn"
        :class="{ activo: filtroActual === f.valor }"
        @click="filtroActual = f.valor"
      >
        {{ f.etiqueta }}
        <!-- Badge con cantidad -->
        <span class="citas-badge">{{ contarFiltro(f.valor) }}</span>
      </button>
    </div>

    <!-- Mensaje si no hay citas en el filtro activo -->
    <div v-if="citasFiltradas.length === 0" class="citas-vacio">
      <img src="iconos/calendario.png" width="40" height="40" alt="" style="opacity:.3;margin-bottom:8px;" />
      <p>No tienes citas {{ filtroActual === 'proximas' ? 'próximas' : filtroActual === 'pasadas' ? 'pasadas' : '' }}.</p>
      <button class="btn-verde" style="margin-top:12px;" @click="abrirFormulario">
        Agendar ahora
      </button>
    </div>

    <!-- Tarjetas de cada cita -->
    <div class="citas-lista">
      <div
        v-for="cita in citasFiltradas"
        :key="cita.id_cita"
        class="cita-card"
        :class="'estado-' + cita.estado"
        role="article"
        :aria-label="'Cita: ' + motivoVisible(cita) + ' el ' + formatearFechaLegible(cita.fecha)"
      >
        <!-- Bloque de fecha (día / mes) -->
        <div class="cita-fecha-bloque" aria-hidden="true">
          <span class="cita-dia">{{ extraerDia(cita.fecha) }}</span>
          <span class="cita-mes">{{ extraerMes(cita.fecha) }}</span>
        </div>

        <!-- Información principal -->
        <div class="cita-info">
          <strong>{{ motivoVisible(cita) }}</strong>
          <p class="cita-hora-texto">🕐 {{ formatearHora(cita.hora) }}</p>
          <p v-if="cita.notas" class="cita-notas-texto">📝 {{ cita.notas }}</p>
        </div>

        <!-- Etiqueta de estado + botón cancelar -->
        <div class="cita-acciones">
          <span class="cita-estado-badge" :class="'badge-' + cita.estado">
            {{ etiquetaEstado(cita.estado) }}
          </span>
          <!-- Solo se puede cancelar si está pendiente -->
          <button
            v-if="cita.estado === 'pendiente'"
            class="btn-ghost btn-sm cita-btn-cancelar"
            @click="confirmarCancelacion(cita)"
            :aria-label="'Cancelar cita del ' + formatearFechaLegible(cita.fecha)"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div><!-- /citas-lista -->

  </div><!-- /v-else -->

  <!-- ── Modal de confirmación de cancelación ───── -->
  <div v-if="citaAcancelar" class="citas-overlay" @click.self="citaAcancelar = null" role="dialog" aria-modal="true" aria-label="Confirmar cancelación">
    <div class="citas-modal">
      <p><strong>¿Cancelar esta cita?</strong></p>
      <p style="color:var(--texto-suave);font-size:.9rem;margin-top:6px;">
        {{ motivoVisible(citaAcancelar) }} —
        {{ formatearFechaLegible(citaAcancelar.fecha) }} a las {{ formatearHora(citaAcancelar.hora) }}
      </p>
      <div class="citas-botones" style="margin-top:20px;">
        <button class="btn-ghost" @click="citaAcancelar = null">No, mantener</button>
        <button class="btn-verde" style="background:var(--rojo-suave);" @click="ejecutarCancelacion" :disabled="cancelando">
          {{ cancelando ? 'Cancelando…' : 'Sí, cancelar' }}
        </button>
      </div>
    </div>
  </div>

</div><!-- /citas-vue-root -->
`;

/* ════ ESTILOS DEL COMPONENTE ═════ */
const ESTILOS_CITAS = `
/* ── Raíz del módulo ── */
.citas-vue-root { font-family: inherit; }

/* ── Encabezado ── */
.citas-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}
.citas-header h2 { margin: 0; font-size: 1.3rem; color: var(--texto); }

/* ── Aviso fallback ── */
.citas-aviso-fallback {
  background: rgba(239,68,68,.08);
  border: 1.5px solid var(--rojo-suave);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: .85rem;
  color: var(--rojo-suave);
}

/* ── Tarjeta contenedora (formulario) ── */
.citas-card {
  background: #fff;
  border: 1.5px solid var(--verde-borde);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 12px rgba(45,125,90,.08);
}
.citas-card-titulo {
  margin: 0 0 18px;
  font-size: 1.05rem;
  color: var(--verde);
}

/* ── Fila doble (fecha + hora) ── */
.citas-fila-doble {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 480px) {
  .citas-fila-doble { grid-template-columns: 1fr; }
}

/* ── Select de especialidad ── */
.citas-vue-root select {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid var(--verde-borde);
  border-radius: 10px;
  font-size: .95rem;
  color: var(--texto);
  background: #fff;
  cursor: pointer;
  appearance: auto;
}
.citas-vue-root select:focus {
  outline: none;
  border-color: var(--verde-claro);
  background: var(--verde-suave);
}

/* ── Textarea ── */
.citas-vue-root textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid var(--verde-borde);
  border-radius: 10px;
  font-size: .9rem;
  color: var(--texto);
  font-family: inherit;
  box-sizing: border-box;
}
.citas-vue-root textarea:focus {
  outline: none;
  border-color: var(--verde-claro);
  background: var(--verde-suave);
}

/* ── Mensajes de error ── */
.citas-error {
  color: var(--rojo-suave);
  font-size: .8rem;
  margin-top: 4px;
  display: block;
}
.obligatorio { color: var(--rojo-suave); }

/* ── Botones de acción del formulario ── */
.citas-botones {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
  flex-wrap: wrap;
}

/* ── Filtros de estado ── */
.citas-filtros {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.citas-filtro-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1.5px solid var(--verde-borde);
  background: #fff;
  color: var(--texto-medio);
  font-size: .85rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all .2s;
}
.citas-filtro-btn.activo {
  background: var(--verde);
  color: #fff;
  border-color: var(--verde);
}
.citas-filtro-btn:hover:not(.activo) {
  background: var(--verde-suave);
}

/* ── Badge de conteo en filtros ── */
.citas-badge {
  background: rgba(255,255,255,.25);
  border-radius: 10px;
  padding: 1px 7px;
  font-size: .75rem;
  font-weight: 700;
}
.citas-filtro-btn:not(.activo) .citas-badge {
  background: var(--verde-suave);
  color: var(--verde);
}

/* ── Estado vacío ── */
.citas-vacio {
  text-align: center;
  padding: 40px 20px;
  color: var(--texto-suave);
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ── Lista de tarjetas de citas ── */
.citas-lista { display: flex; flex-direction: column; gap: 12px; }

/* ── Tarjeta individual de cita ── */
.cita-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border: 1.5px solid var(--verde-borde);
  border-radius: 14px;
  padding: 14px 16px;
  transition: box-shadow .2s;
}
.cita-card:hover { box-shadow: 0 4px 16px rgba(45,125,90,.12); }

/* Citas canceladas se ven apagadas */
.cita-card.estado-cancelada { opacity: .55; }

/* ── Bloque de fecha (día/mes) ── */
.cita-fecha-bloque {
  min-width: 48px;
  background: var(--verde-suave);
  border: 1.5px solid var(--verde-borde);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 6px;
  line-height: 1;
}
.cita-dia  { font-size: 1.4rem; font-weight: 700; color: var(--verde); }
.cita-mes  { font-size: .7rem; color: var(--texto-suave); text-transform: uppercase; }

/* ── Info de la cita ── */
.cita-info { flex: 1; min-width: 0; }
.cita-info strong { display: block; color: var(--texto); font-size: .95rem; }
.cita-hora-texto  { margin: 4px 0 0; font-size: .82rem; color: var(--texto-medio); }
.cita-notas-texto { margin: 3px 0 0; font-size: .78rem; color: var(--texto-suave); }

/* ── Acciones + badge de estado ── */
.cita-acciones {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  white-space: nowrap;
}
.cita-estado-badge {
  font-size: .72rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 12px;
}
.badge-pendiente  { background: #FFF8E1; color: #F9A825; }
.badge-completada { background: var(--verde-suave); color: var(--verde); }
.badge-cancelada  { background: #FFEBEE; color: var(--rojo-suave); }

.cita-btn-cancelar {
  font-size: .72rem !important;
  padding: 4px 10px !important;
  color: var(--rojo-suave) !important;
  border-color: var(--rojo-suave) !important;
}
.cita-btn-cancelar:hover {
  background: #FFEBEE !important;
}

/* ── Spinner de carga ── */
.citas-cargando {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 30px 0;
  color: var(--texto-suave);
  justify-content: center;
}
.citas-spinner {
  width: 22px; height: 22px;
  border: 3px solid var(--verde-borde);
  border-top-color: var(--verde);
  border-radius: 50%;
  animation: citas-girar .7s linear infinite;
}
@keyframes citas-girar { to { transform: rotate(360deg); } }

/* ── Modal de confirmación ── */
.citas-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}
.citas-modal {
  background: #fff;
  border-radius: 18px;
  padding: 28px 24px;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
}

/* ── Transición de entrada del formulario ── */
.citas-slide-enter-active,
.citas-slide-leave-active { transition: all .25s ease; }
.citas-slide-enter-from   { opacity: 0; transform: translateY(-12px); }
.citas-slide-leave-to     { opacity: 0; transform: translateY(-8px); }
`;

/* ═════ FUNCIÓN PRINCIPAL: iniciarVueCitas() ══════ */

function iniciarVueCitas() {
  /* ── Insertar estilos una sola vez en el <head> ── */
  if (!document.getElementById('estilos-citas-vue')) {
    const style = document.createElement('style');
    style.id = 'estilos-citas-vue';
    style.textContent = ESTILOS_CITAS;
    document.head.appendChild(style);
  }

  /* ── Buscar el punto de montaje en el DOM ─────── */
  const mountPoint = document.getElementById('app-citas');
  if (!mountPoint) {
    console.warn('[VueCitas] #app-citas no encontrado en el DOM.');
    return;
  }

  /* Limpiar instancia anterior si existía */
  if (window._vueCitasApp) {
    window._vueCitasApp.unmount();
    window._vueCitasApp = null;
  }
  mountPoint.innerHTML = '';

  /* ── Crear y montar la app Vue ─────────────────── */
  const appCitas = Vue.createApp({
    template: TEMPLATE_CITAS,

    data() {
      /* Estado reactivo inicial del componente */
      return {
        /* Lista de citas cargadas desde la API */
        citas: [],

        /* Controla si el formulario está visible */
        mostrarFormulario: false,

        /* true cuando estamos editando (no implementado en esta versión) */
        editando: false,

        /* Modelo del formulario de nueva cita */
        form: {
          fecha:        '',
          hora:         '',
          especialidad: '',
          motivoOtro:   '',
          notas:        '',
        },

        /* Errores de validación del formulario */
        errores: {
          fecha:        '',
          hora:         '',
          especialidad: '',
        },

        /* Lista de especialidades para el <select> */
        especialidades: ESPECIALIDADES,

        /* Filtros de la lista */
        filtros: [
          { valor: 'todas',   etiqueta: 'Todas'    },
          { valor: 'proximas', etiqueta: 'Próximas' },
          { valor: 'pasadas',  etiqueta: 'Pasadas'  },
        ],
        filtroActual: 'todas',

        /* Estados de carga / operación */
        cargando:  true,
        guardando: false,
        cancelando: false,

        /* Cita seleccionada para cancelar (activa el modal) */
        citaAcancelar: null,

        /* true si la API falló y usamos datos de ejemplo */
        modoFallback: false,

        /* true si los datos vienen del caché local */
        desdeCache: false,
      };
    },

    computed: {
      /**
       * Fecha mínima para el input date: hoy en formato YYYY-MM-DD.
       * Evita que el paciente agende citas en fechas pasadas.
       */
      hoyISO() {
        return new Date().toISOString().slice(0, 10);
      },

      /**
       * Citas filtradas según el tab activo:
       * - "proximas": fecha >= hoy y estado != cancelada
       * - "pasadas":  fecha < hoy o completadas
       * - "todas":    sin ningun filtro
       */
      citasFiltradas() {
        const hoy = this.hoyISO;
        return this.citas.filter(c => {
          if (this.filtroActual === 'proximas') {
            return c.fecha >= hoy && c.estado !== 'cancelada';
          }
          if (this.filtroActual === 'pasadas') {
            return c.fecha < hoy || c.estado === 'completada';
          }
          return true; // "todas"
        });
      },
    },

    methods: {
      /* ── Caché local por usuario ────────────────── */
      guardarCacheLocal() {
        try {
          localStorage.setItem(getCitasCacheKey(), JSON.stringify(this.citas));
        } catch(e) {}
      },

      cargarCacheLocal() {
        try {
          const data = localStorage.getItem(getCitasCacheKey());
          if (data) {
            this.citas = JSON.parse(data);
            this.desdeCache = true;
          }
        } catch(e) {}
      },

      /* ── Cargar citas desde la API (con espera de token) ── */
      async cargarCitas() {
        /* Esperar hasta 3 s a que el token esté disponible */
        const esperarToken = (intentos) => new Promise((res) => {
          const check = (n) => {
            if (window.App?.token) { res(true); }
            else if (n <= 0)       { res(false); }
            else setTimeout(() => check(n - 1), 200);
          };
          check(intentos);
        });

        const hayToken = await esperarToken(15);

        if (!hayToken) {
          /* Sin sesión activa: limpiar citas para no mostrar datos de otro usuario */
          this.citas        = [];
          this.modoFallback = false;
          this.cargando     = false;
          return;
        }

        this.cargando = true;
        try {
          const resp = await window.api('mis_citas', {}, true);
          if (resp?.ok && Array.isArray(resp.citas)) {
            this.citas        = resp.citas;
            this.modoFallback = false;
            this.guardarCacheLocal();
          } else {
            throw new Error('Respuesta inválida de la API');
          }
        } catch (err) {
          /* Si falla Y hay caché del usuario actual, usarla en lugar del fallback */
          const cacheKey = getCitasCacheKey();
          const cached   = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              this.citas        = JSON.parse(cached);
              this.modoFallback = true;
              console.warn('[VueCitas] API no disponible, usando caché local.', err);
            } catch(e) {
              this.citas        = [];
              this.modoFallback = false;
            }
          } else {
            /* Sin caché y sin API: lista vacía (no CITAS_FALLBACK global) */
            this.citas        = [];
            this.modoFallback = false;
            console.warn('[VueCitas] API no disponible y sin caché. Lista vacía.', err);
          }
        } finally {
          this.cargando = false;
        }
      },

      /* ── Abrir formulario de nueva cita ────────── */
      abrirFormulario() {
        /* Limpiar formulario y errores antes de mostrar */
        this.form = { fecha: '', hora: '', especialidad: '', motivoOtro: '', notas: '' };
        this.errores = { fecha: '', hora: '', especialidad: '' };
        this.editando = false;
        this.mostrarFormulario = true;
        /* Accesibilidad: mover el foco al primer campo */
        this.$nextTick(() => {
          const primer = document.getElementById('cita-fecha-v');
          if (primer) primer.focus();
        });
      },

      /* ── Cerrar formulario ─────────────────────── */
      cerrarFormulario() {
        this.mostrarFormulario = false;
      },

      /* ── Validar los campos del formulario ─────── */
      validarFormulario() {
        let valido = true;
        /* Resetear mensajes */
        this.errores = { fecha: '', hora: '', especialidad: '' };

        if (!this.form.fecha) {
          this.errores.fecha = 'La fecha es obligatoria.';
          valido = false;
        } else if (this.form.fecha < this.hoyISO) {
          this.errores.fecha = 'La fecha no puede ser en el pasado.';
          valido = false;
        }

        if (!this.form.hora) {
          this.errores.hora = 'La hora es obligatoria.';
          valido = false;
        }

        if (!this.form.especialidad) {
          this.errores.especialidad = 'Selecciona una especialidad.';
          valido = false;
        }

        return valido;
      },

      /* ── Guardar la nueva cita ─────────────────── */
      async guardarCita() {
        if (!this.validarFormulario()) return;

        /* Determinar el motivo final */
        const motivo = this.form.especialidad === 'Otro / especificar'
          ? this.form.motivoOtro || 'Otro'
          : this.form.especialidad;

        this.guardando = true;
        try {
          if (this.modoFallback) {
            /* Sin API: agregar localmente con ID temporal */
            this.citas.unshift({
              id_cita: Date.now(),
              fecha:   this.form.fecha,
              hora:    this.form.hora + ':00',
              motivo:  motivo,
              notas:   this.form.notas,
              estado:  'pendiente',
            });
            this.guardarCacheLocal();
            window.mostrarToast?.('✅', 'Cita guardada', 'Guardada localmente (sin conexión).');
          } else {
            /* Con API: enviar al servidor */
            const resp = await window.api('agendar_cita', {
              fecha:  this.form.fecha,
              hora:   this.form.hora,
              motivo: motivo,
              notas:  this.form.notas,
            }, true);

            if (resp?.ok) {
              window.mostrarToast?.('✅', '¡Cita agendada!', `El ${this.formatearFechaLegible(this.form.fecha)} a las ${this.formatearHora(this.form.hora + ':00')}.`);
              /* Recargar la lista actualizada */
              await this.cargarCitas();
            } else {
              throw new Error(resp?.error || 'Error al agendar la cita.');
            }
          }
          this.cerrarFormulario();
        } catch (err) {
          window.mostrarToast?.('❌', 'Error', err.message || 'No se pudo agendar la cita.');
          console.error('[VueCitas] guardarCita:', err);
        } finally {
          this.guardando = false;
        }
      },

      /* ── Mostrar el modal de confirmación ──────── */
      confirmarCancelacion(cita) {
        this.citaAcancelar = cita;
      },

      /* ── Ejecutar la cancelación de la cita ────── */
      async ejecutarCancelacion() {
        if (!this.citaAcancelar) return;
        this.cancelando = true;

        try {
          if (this.modoFallback) {
            /* Sin API: marcar localmente */
            const idx = this.citas.findIndex(c => c.id_cita === this.citaAcancelar.id_cita);
            if (idx !== -1) this.citas[idx].estado = 'cancelada';
            this.guardarCacheLocal();
            window.mostrarToast?.('✅', 'Cita cancelada', 'Cancelada localmente (sin conexión).');
          } else {
            const resp = await window.api('cancelar_cita', {
              id_cita: this.citaAcancelar.id_cita,
            }, true);

            if (resp?.ok) {
              window.mostrarToast?.('✅', 'Cita cancelada', 'La cita fue cancelada correctamente.');
              await this.cargarCitas();
            } else {
              throw new Error(resp?.error || 'No se pudo cancelar la cita.');
            }
          }
        } catch (err) {
          window.mostrarToast?.('❌', 'Error', err.message);
          console.error('[VueCitas] ejecutarCancelacion:', err);
        } finally {
          this.cancelando    = false;
          this.citaAcancelar = null;
        }
      },

      /* ── Conteo para los badges de los filtros ─── */
      contarFiltro(filtro) {
        const hoy = this.hoyISO;
        return this.citas.filter(c => {
          if (filtro === 'proximas') return c.fecha >= hoy && c.estado !== 'cancelada';
          if (filtro === 'pasadas')  return c.fecha < hoy  || c.estado === 'completada';
          return true;
        }).length;
      },

      /* ── Helpers de presentación ───────────────── */

      /** Extrae el número de día de una fecha ISO (YYYY-MM-DD) */
      extraerDia(fechaISO) {
        return fechaISO ? parseInt(fechaISO.split('-')[2], 10) : '--';
      },

      /** Extrae el nombre corto del mes de una fecha ISO */
      extraerMes(fechaISO) {
        if (!fechaISO) return '---';
        const mes = parseInt(fechaISO.split('-')[1], 10) - 1;
        return MESES_CORTOS[mes] || '---';
      },

      /** Convierte 'HH:MM:SS' a 'HH:MM a.m./p.m.' para mayor legibilidad */
      formatearHora(hora) {
        if (!hora) return '';
        const [h, m] = hora.split(':').map(Number);
        const sufijo = h < 12 ? 'a.m.' : 'p.m.';
        const h12    = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
      },

      /** Devuelve el motivo o un texto por defecto si está vacío */
      motivoVisible(cita) {
        return cita.motivo?.trim() || 'Cita médica';
      },

      /* Convierte una fecha ISO a formato legible */
      formatearFechaLegible(fechaISO) {
        if (!fechaISO) return '';
        const [a, m, d] = fechaISO.split('-').map(Number);
        const meses = [
          'enero','febrero','marzo','abril','mayo','junio',
          'julio','agosto','septiembre','octubre','noviembre','diciembre',
        ];
        return `${d} de ${meses[m - 1]} de ${a}`;
      },

      /** Devuelve una etiqueta amigable para el estado de la cita */
      etiquetaEstado(estado) {
        const mapa = {
          pendiente:  'Pendiente',
          completada: 'Completada',
          cancelada:  'Cancelada',
        };
        return mapa[estado] || estado;
      },
    },

    /* ── Ciclo de vida: cargar al montar ─────────── */
    mounted() {
      /* Mostrar caché del usuario actual mientras carga del servidor */
      this.cargarCacheLocal();
      this.cargarCitas();
    },
  });

  /* Montar la app en el DOM */
  window._vueCitasApp = appCitas.mount('#app-citas');
}

/* ════════ BOOTSTRAP (UNIFICADO) ════════ */

/**
 * Hook global — script.js lo llama cuando el paciente guarda un nuevo signo
 * desde otro punto de entrada (p.ej. el formulario rápido del dashboard).
 */
window.notificarNuevoSigno = function(registroOptimista) {
  const vue = window._vueSignosApp;
  if (!vue) return;
  if (registroOptimista) { vue.historial.unshift(registroOptimista); vue.guardarCacheLocal(); }
  vue.cargarHistorial().catch(() => {});
};

/**
 * window.iniciarVueCitas
 * Punto de entrada que llama irA('pagina-agendar-cita') en script.js.
 * iniciarVueCitas() ya está definida arriba (en el bloque de citas_vue).
 * Solo la exponemos globalmente aquí para mantener un único lugar de registro.
 */
window.iniciarVueCitas  = iniciarVueCitas;
window.iniciarVueSignos = iniciarVueSignos;

console.log('[vue-modulos.js] Módulos de Signos Vitales y Citas cargados ✓');
