/* ========================================
   1. CONFIGURACIÓN DE INDEXEDDB
======================================== */

// Configuración de la base de datos
const DB_NAME = "ByteMusicDB";
const DB_VERSION = 2;
const STORE_NAME = "canciones";
const PLAYLIST_STORE_NAME = "playlists";

// Variables globales de la aplicación
let db;
let canciones = [];
let playlists = [];
let playlistActual = "default";

// Abrir la base de datos
const request = indexedDB.open(DB_NAME, DB_VERSION);
// Crear o actualizar la estructura de la base de datos
request.onupgradeneeded = (event) => {
  const dbUpgrade = event.target.result;
  const transaction = event.target.transaction;
  let cancionesStore;
  // Crear el almacén de canciones si no existe
  if (!dbUpgrade.objectStoreNames.contains(STORE_NAME)) {
    cancionesStore = dbUpgrade.createObjectStore(STORE_NAME, {
      keyPath: "id",
      autoIncrement: true,
    });
  } else {
    cancionesStore = transaction.objectStore(STORE_NAME);
  }
  // Crear el almacén de playlists si no existe
  if (!dbUpgrade.objectStoreNames.contains(PLAYLIST_STORE_NAME)) {
    const playlistsStore = dbUpgrade.createObjectStore(PLAYLIST_STORE_NAME, {
      keyPath: "id",
    });
    // Crear la playlist predeterminada
    playlistsStore.add({
      id: "default",
      nombre: "Mi playlist",
    });
  }
  // Migrar las canciones antiguas a la playlist predeterminada
  if (event.oldVersion < 2) {
    const cursorRequest = cancionesStore.openCursor();
    cursorRequest.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      const cancion = cursor.value;
      if (!cancion.playlistId) {
        cancion.playlistId = "default";
        cursor.update(cancion);
      }
      cursor.continue();
    };
  }
};

// Cuando la base de datos se abre correctamente
request.onsuccess = (event) => {
  db = event.target.result;
  console.log("Base de datos ByteMusic abierta correctamente.");
  // Si se cierra la conexión desde otra pestaña o herramienta
  db.onversionchange = () => {
    db.close();
    console.warn("La base de datos se ha cerrado por un cambio de versión.");
  };
  cargarPlaylists();
};
// Si ocurre un error al abrir la base de datos
request.onerror = () => {
  console.error("Error al abrir IndexedDB:", request.error);
};
// Si otra pestaña impide actualizar la base de datos
request.onblocked = () => {
  console.warn(
    "La apertura de IndexedDB está bloqueada. Cierra otras pestañas de ByteMusic.",
  );
};

/* ========================================
   2. ELEMENTOS DEL DOM
======================================== */

/* ---------- Reproductor ---------- */

const tituloCancion = document.querySelector("#reproductor-musica h6");
const nombreArtista = document.getElementById("nombre");
const cancion = document.getElementById("cancion");
const progreso = document.getElementById("progreso");
const controlVolumen = document.getElementById("control-volumen");
const iconoControl = document.querySelector(".iconoControl");
const botonReproducirPausar = document.querySelector(
  ".boton-reproducir-pausar",
);
const botonAtras = document.querySelector(".atras");
const botonAdelante = document.querySelector(".adelante");
const botonAleatorio = document.querySelector(".aleatorio");
const botonRepetir = document.querySelector(".repetir");
const divMinutos = document.getElementById("minutos");
/* ---------- Lista de canciones ---------- */
const playListContainer = document.getElementById("playlist-container");
/* ---------- Playlists ---------- */
const botonCrearPlaylist = document.getElementById("crear-playlist");
const listaPlaylists = document.getElementById("lista-playlists");
/* ---------- Modal de creación de playlist ---------- */
const modalCrearPlaylist = document.getElementById("modalCrearPlaylist");
const formularioPlaylist = document.getElementById("formCrearPlaylist");
const inputNombrePlaylist = document.getElementById("nombrePlaylist");
const errorNombrePlaylist = document.getElementById("errorNombrePlaylist");
/* ---------- Mensaje de éxito ---------- */
const tarjeta = document.getElementById("tarjetaExito");

/* =========================================================
   3. GESTIÓN DE PLAYLISTS
   ========================================================= */

/* ---------- Cargar playlists ---------- */
function cargarPlaylists() {
  if (!db) {
    console.error("La base de datos todavía no está preparada.");
    return;
  }
  const transaction = db.transaction(PLAYLIST_STORE_NAME, "readonly");
  const store = transaction.objectStore(PLAYLIST_STORE_NAME);
  const request = store.getAll();
  request.onsuccess = () => {
    playlists = request.result;
    // Si no hay playlists, crear la predeterminada
    if (playlists.length === 0) {
      crearPlaylistInicial();
      return;
    }
    mostrarPlaylists();
    cargarCanciones();
  };

  request.onerror = () => {
    console.error("Error al cargar las playlists:", request.error);
  };
}

/* ---------- Crear playlist inicial ---------- */

function crearPlaylistInicial() {
  if (!db) {
    console.error("La base de datos todavía no está preparada.");
    return;
  }
  const playlistInicial = {
    id: "default",
    nombre: "Mi playlist",
  };
  const transaction = db.transaction(PLAYLIST_STORE_NAME, "readwrite");
  const store = transaction.objectStore(PLAYLIST_STORE_NAME);
  const request = store.add(playlistInicial);
  request.onsuccess = () => {
    playlists = [playlistInicial];
    playlistActual = "default";
    mostrarPlaylists();
    cargarCanciones();
  };
  request.onerror = () => {
    console.error("Error al crear la playlist inicial:", request.error);
  };
}

/* ---------- Mostrar playlists en la interfaz ---------- */

function mostrarPlaylists() {
  if (!listaPlaylists) {
    console.error("No se encuentra el contenedor de playlists.");
    return;
  }
  listaPlaylists.innerHTML = "";
  playlists.forEach((playlist) => {
    const enlace = document.createElement("a");
    enlace.href = "#";
    enlace.classList.add("sidebar-item");
    enlace.title = playlist.nombre;

    // Crear el icono y el nombre por separado
    const icono = document.createElement("i");
    icono.className = "bi bi-music-note-list";

    const nombre = document.createElement("span");
    nombre.textContent = playlist.nombre;

    enlace.appendChild(icono);
    enlace.appendChild(nombre);
    // Cambiar de playlist al pulsar
    enlace.addEventListener("click", (event) => {
      event.preventDefault();
      seleccionarPlaylist(playlist.id);
    });
    // Marcar visualmente la playlist seleccionada
    if (playlist.id === playlistActual) {
      enlace.classList.add("active");
    }
    listaPlaylists.appendChild(enlace);
  });
}
/* ---------- Seleccionar playlist ---------- */
function seleccionarPlaylist(id) {
  const playlistSeleccionada = playlists.find((playlist) => playlist.id === id);
  if (!playlistSeleccionada) {
    console.error("No se ha encontrado la playlist:", id);
    return;
  }
  playlistActual = id;
  // Actualizar el título de la playlist
  const tituloPlaylist = document.querySelector(".playlist-header h2");
  if (tituloPlaylist) {
    tituloPlaylist.textContent = playlistSeleccionada.nombre;
  }
  // Actualizar el estado visual de la barra lateral
  mostrarPlaylists();
  // Cargar las canciones de la playlist seleccionada
  cargarCanciones();
}

/* Crear una nueva playlist */

/* Abrir el modal al pulsar el botón + */
botonCrearPlaylist.addEventListener("click", () => {
  errorNombrePlaylist.textContent = "";
  const modal = bootstrap.Modal.getOrCreateInstance(modalCrearPlaylist);
  modal.show();
  // Colocar el cursor en el campo del nombre
  modalCrearPlaylist.addEventListener(
    "shown.bs.modal",
    () => {
      inputNombrePlaylist.focus();
    },
    { once: true },
  );
});

/* Crear una playlist al enviar el formulario */
formularioPlaylist.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!db) {
    errorNombrePlaylist.textContent =
      "La base de datos todavía no está preparada.";
    return;
  }
  const nombre = inputNombrePlaylist.value.trim();
  // Comprobar que el nombre no esté vacío
  if (nombre === "") {
    errorNombrePlaylist.textContent = "Escribe un nombre para la playlist.";
    inputNombrePlaylist.focus();
    return;
  }
  // Evitar nombres duplicados
  const nombreExiste = playlists.some(
    (playlist) => playlist.nombre.toLowerCase() === nombre.toLowerCase(),
  );

  if (nombreExiste) {
    errorNombrePlaylist.textContent = "Ya existe una playlist con ese nombre.";
    inputNombrePlaylist.focus();
    return;
  }
  const nuevaPlaylist = {
    id: crypto.randomUUID(),
    nombre: nombre,
  };
  const transaction = db.transaction(PLAYLIST_STORE_NAME, "readwrite");
  const store = transaction.objectStore(PLAYLIST_STORE_NAME);
  const addRequest = store.add(nuevaPlaylist);
  addRequest.onsuccess = () => {
    playlists.push(nuevaPlaylist);
    mostrarPlaylists();
    seleccionarPlaylist(nuevaPlaylist.id);
    // Limpiar el formulario y cerrar el modal
    formularioPlaylist.reset();
    errorNombrePlaylist.textContent = "";
    bootstrap.Modal.getOrCreateInstance(modalCrearPlaylist).hide();
    console.log("Playlist creada:", nuevaPlaylist.nombre);
  };

  addRequest.onerror = () => {
    errorNombrePlaylist.textContent =
      "No se ha podido crear la playlist. Inténtalo de nuevo.";
    console.error("Error al crear la playlist:", addRequest.error);
  };
});

/* Limpiar el formulario al cerrar el modal */
modalCrearPlaylist.addEventListener("hidden.bs.modal", () => {
  formularioPlaylist.reset();
  errorNombrePlaylist.textContent = "";
});

/* =========================================================
   CANCIONES
   ========================================================= */

function cargarCanciones() {
  if (!db) return;

  const request = db
    .transaction(STORE_NAME, "readonly")
    .objectStore(STORE_NAME)
    .getAll();

  request.onsuccess = () => {
    canciones = request.result
      .filter((c) => (c.playlistId || "default") === playlistActual)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((c) => ({ ...c, fuente: URL.createObjectURL(c.archivo) }));

    actualizarPlaylist();
    inicializarSortable();

    if (indiceCancionActual >= canciones.length) {
      indiceCancionActual = 0;
    }
  };
}

function comprobarAnchura() {
  const contenedor = document.querySelector(".titulo-container");
  if (tituloCancion.scrollWidth > contenedor.clientWidth) {
    tituloCancion.classList.add("scroll");
    console.log("Anchura del título:" + tituloCancion.classList);
  } else {
    tituloCancion.classList.remove("scroll");
  }
}

/* =========================================================
   TARJETAS
   ========================================================= */

function sacarTargeta() {
  tarjeta.style.display = "block";
}

function cerrarTarjeta() {
  tarjeta.style.display = "none";
}

/* =========================================================
   AÑADIR CANCIONES
   ========================================================= */

/* ===== 5. AÑADIR CANCIONES ===== */

document.getElementById("musica-input").addEventListener("change", (e) => {
  if (!db) return;

  const archivos = Array.from(e.target.files);

  archivos.forEach((archivo) => {
    const nombreArchivo = archivo.name.replace(/\.[^/.]+$/, "");
    const partes = nombreArchivo.split("-");
    const datosCancion = {
      titulo: partes.slice(1).join("-").trim() || "Título desconocido",
      nombre: partes[0].trim() || "Artista desconocido",
      archivo,
      imagenUrl:
        "https://img.freepik.com/fotos-premium/chica-anime-escuchando-musica-noche-lofi-triste_911078-5774.jpg",
      playlistId: playlistActual,
      orden: canciones.length,
    };

    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).add(datosCancion);

    request.onsuccess = () => {
      canciones.push({
        ...datosCancion,
        id: request.result,
        fuente: URL.createObjectURL(archivo),
      });

      actualizarPlaylist();

      if (canciones.length === 1) {
        indiceCancionActual = 0;
        actualizarInfoCancion();
      }
    };

    request.onerror = () => {
      console.error(`No se pudo importar ${archivo.name}:`, request.error);
    };
  });

  if (archivos.length > 0) sacarTargeta();

  e.target.value = "";
});

/* =========================================================
   MOSTRAR PLAYLIST
   ========================================================= */

function actualizarPlaylist() {
  playListContainer.innerHTML = "";
  if (canciones.length === 0) {
    const li = document.createElement("li");
    li.id = "playlist-vacia";
    li.textContent = "Todavía no has añadido ninguna canción";
    playListContainer.appendChild(li);
    return;
  }

  canciones.forEach((c, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;
    const img = document.createElement("img");
    img.src = c.imagenUrl;
    img.style.cssText = "border-radius: 15px; margin-right: 5px;";
    img.classList.add("active");
    const span = document.createElement("span");
    span.textContent = `${c.titulo} - ${c.nombre}`;
    const botonBorrar = document.createElement("button");
    botonBorrar.innerHTML = '<i class="bi bi-trash3"></i>';
    botonBorrar.classList.add("boton-borrar");
    botonBorrar.addEventListener("click", (event) => {
      event.stopPropagation();
      borrarCancion(c.id);
    });
    const botonMover = document.createElement("button");
    botonMover.innerHTML = '<i class="bi bi-grip-vertical"></i>';
    botonMover.classList.add("boton-mover");
    li.onclick = () => {
      indiceCancionActual = index;
      actualizarInfoCancion();
      reproducirCancion();
      comprobarAnchura();
    };
    if (index === indiceCancionActual) {
      const loader = document.createElement("div");
      loader.classList.add("loader");
      span.appendChild(loader);
      li.classList.add("active");
    }
    li.append(img, span, botonBorrar, botonMover);
    playListContainer.appendChild(li);
  });
}

/* =========================================================
   BORRAR CANCIÓN
   ========================================================= */

function borrarCancion(id) {
  if (!db) {
    return;
  }
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  store.delete(id);
  transaction.oncomplete = () => {
    canciones = canciones.filter((cancionItem) => cancionItem.id !== id);
    if (indiceCancionActual >= canciones.length) {
      indiceCancionActual = Math.max(0, canciones.length - 1);
    }
    actualizarPlaylist();
    if (canciones.length > 0) {
      actualizarInfoCancion();
    }
  };
}

/* =========================================================
   VARIABLES DEL REPRODUCTOR
   ========================================================= */

let indiceCancionActual = 0;
let modoAleatorio = false;
let modoRepetir = false;

/* =========================================================
   INFORMACIÓN DE LA CANCIÓN
   ========================================================= */

function actualizarInfoCancion() {
  if (canciones.length === 0 || !canciones[indiceCancionActual]) {
    return;
  }
  tituloCancion.textContent = canciones[indiceCancionActual].titulo;
  nombreArtista.textContent = canciones[indiceCancionActual].nombre;
  cancion.src = canciones[indiceCancionActual].fuente;
  cancion.loop = modoRepetir;
  actualizarPlaylist();
  comprobarAnchura();
  cancion.addEventListener("loadeddata", function () {});
}

/* =========================================================
   VOLUMEN
   ========================================================= */

controlVolumen.addEventListener("input", function () {
  cancion.volume = controlVolumen.value;
  let valor = ((this.value - this.min) / (this.max - this.min)) * 100;
  this.style.background = `linear-gradient(to right, #FFFAFA ${valor}%, #272727 ${valor}%)`;
});

cancion.addEventListener("volumechange", function () {
  controlVolumen.value = cancion.volume;
});

/* =========================================================
   PROGRESO
   ========================================================= */

cancion.addEventListener("loadedmetadata", function () {
  progreso.max = cancion.duration;
  progreso.value = cancion.currentTime;
  actualizarMinutosRestantes();
});

/* =========================================================
   PLAY / PAUSA
   ========================================================= */

botonReproducirPausar.addEventListener("click", reproducirPausar);

function reproducirPausar() {
  console.log("reproducri");
  if (cancion.paused) {
    reproducirCancion();
  } else {
    pausarCancion();
  }
}

function reproducirCancion() {
  if (canciones.length === 0) {
    return;
  }
  cancion.play();
  const loader = document.querySelector(".loader");
  if (loader) {
    loader.style.animationPlayState = "running";
  }
  iconoControl.classList.add("bi-pause-circle-fill");
  iconoControl.classList.remove("bi-play-circle-fill");
}

function pausarCancion() {
  cancion.pause();
  const loader = document.querySelector(".loader");
  if (loader) {
    loader.style.animationPlayState = "paused";
  }
  iconoControl.classList.remove("bi-pause-circle-fill");
  iconoControl.classList.add("bi-play-circle-fill");
}

/* =========================================================
   TIMEUPDATE
   ========================================================= */

cancion.addEventListener("timeupdate", function () {
  if (!cancion.paused) {
    progreso.value = cancion.currentTime;
    const porcentaje =
      ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;
    progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
    actualizarMinutosRestantes();
  }
});

/* =========================================================
   CAMBIAR PROGRESO
   ========================================================= */

progreso.addEventListener("input", function () {
  cancion.currentTime = progreso.value;
  const porcentaje =
    ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;

  progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
});

/* =========================================================
   SIGUIENTE
   ========================================================= */

botonAdelante.addEventListener("click", function () {
  if (canciones.length === 0) {
    return;
  }
  console.log(indiceCancionActual);
  if (modoRepetir) {
    cancion.currentTime = 0;
    reproducirCancion();
    return;
  }

  if (modoAleatorio) {
    indiceCancionActual = obtenerIndiceAleatorio();
  } else {
    indiceCancionActual = (indiceCancionActual + 1) % canciones.length;
  }
  actualizarInfoCancion();
  reproducirCancion();
});

/* =========================================================
   ANTERIOR
   ========================================================= */

botonAtras.addEventListener("click", function () {
  if (canciones.length === 0) {
    return;
  }
  console.log(indiceCancionActual);
  if (modoAleatorio) {
    indiceCancionActual = obtenerIndiceAleatorio();
  } else {
    indiceCancionActual =
      (indiceCancionActual - 1 + canciones.length) % canciones.length;
  }
  actualizarInfoCancion();
  reproducirCancion();
});

/* =========================================================
   ALEATORIO
   ========================================================= */

botonAleatorio.addEventListener("click", function () {
  modoAleatorio = !modoAleatorio;
  console.log(modoAleatorio);
  botonAleatorio.classList.toggle("active");
  cancion.loop = modoRepetir;
});

/* =========================================================
   CANCIÓN TERMINADA
   ========================================================= */

cancion.addEventListener("ended", function () {
  if (canciones.length === 0) {
    return;
  }
  if (modoRepetir) {
    cancion.currentTime = 0;
    reproducirCancion();
    return;
  }

  if (modoAleatorio) {
    indiceCancionActual = obtenerIndiceAleatorio();
  } else {
    indiceCancionActual = (indiceCancionActual + 1) % canciones.length;
  }
  actualizarInfoCancion();
  reproducirCancion();
});

/* =========================================================
   OBTENER ÍNDICE ALEATORIO
   ========================================================= */

function obtenerIndiceAleatorio() {
  if (canciones.length === 0) {
    return 0;
  }
  let nuevoIndice;
  do {
    nuevoIndice = Math.floor(Math.random() * canciones.length);
  } while (nuevoIndice === indiceCancionActual && canciones.length > 1);
  return nuevoIndice;
}

/* =========================================================
   REPETIR
   ========================================================= */

botonRepetir.addEventListener("click", function () {
  console.log("entrando");
  modoRepetir = !modoRepetir;
  botonRepetir.classList.toggle("active");
  cancion.loop = modoRepetir;
});

/* =========================================================
   MINUTOS RESTANTES
   ========================================================= */

function actualizarMinutosRestantes() {
  if (!Number.isFinite(cancion.duration)) {
    return;
  }
  let tiempoRestante = cancion.duration - cancion.currentTime;
  let minutos = Math.floor(tiempoRestante / 60);
  let segundos = Math.floor(tiempoRestante % 60)
    .toString()
    .padStart(2, "0");

  divMinutos.textContent = `${minutos} : ${segundos}`;
}

/* =========================================================
   SORTABLE
   ========================================================= */

function inicializarSortable() {
  /*
   * Evitamos crear varios Sortable
   * sobre el mismo elemento.
   */
  if (playListContainer._sortable) {
    playListContainer._sortable.destroy();
  }

  playListContainer._sortable = new Sortable(playListContainer, {
    animation: 150,
    handle: ".boton-mover",
    onEnd: function (event) {
      if (event.oldIndex === undefined || event.newIndex === undefined) {
        return;
      }
      const elementoMovido = canciones.splice(event.oldIndex, 1)[0];
      canciones.splice(event.newIndex, 0, elementoMovido);
      console.log("Nuevo orden:", canciones);
      if (!db) {
        return;
      }
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      canciones.forEach((cancionItem, index) => {
        cancionItem.orden = index;
        store.put(cancionItem);
      });
    },
  });
}
