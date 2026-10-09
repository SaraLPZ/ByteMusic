const DB_NAME = "ByteMusicDB";
const DB_VERSION = 1;
const STORE_NAME = "canciones";

let db;

const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  db.createObjectStore(STORE_NAME, {
    keyPath: "id",
    autoIncrement: true,
  });
};

request.onsuccess = (event) => {
  db = event.target.result;
  cargarCanciones();
};
const tituloCancion = document.querySelector("#reproductor-musica h6");
const nombreArtista = document.querySelector("#nombre");
const progreso = document.getElementById("progreso");
const cancion = document.getElementById("cancion");
const controlVolumen = document.getElementById("control-volumen");
const iconoControl = document.querySelector(".iconoControl");
const botonReproducirPausar = document.querySelector(
  ".boton-reproducir-pausar",
);
const tarjeta = document.getElementById("tarjetaExito");
const botonAtras = document.querySelector(".atras");
const botonAdelante = document.querySelector(".adelante");
const playListContainer = document.getElementById("playlist-container");
const botonAleatorio = document.querySelector(".aleatorio");
const botonRepetir = document.querySelector(".repetir");
const divMinutos = document.getElementById("minutos");

function cargarCanciones() {
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);

  const request = store.getAll();

  request.onsuccess = () => {
    canciones = request.result.map((cancion) => ({
      ...cancion,
      fuente: URL.createObjectURL(cancion.archivo),
    }));

    actualizarPlaylist();
  };
}
// Verifica si el texto es más grande que el contenedor
function Sara() {
  const contenedor = document.querySelector(".titulo-container");
  if (tituloCancion.scrollWidth > contenedor.clientWidth) {
    tituloCancion.classList.add("scroll");
    console.log("hshshshs" + tituloCancion.classList);
    // Agrega la animación si es necesario
  } else {
    // Si el texto es pequeño, no se anima
    tituloCancion.classList.remove("scroll");
  }
}

/* Targetas funciones y accciones */
function sacarTargeta() {
  tarjeta.style.display = "block";
}
// Función para cerrar la tarjeta
function cerrarTarjeta() {
  tarjeta.style.display = "none"; // Oculta la tarjeta
}

/* ***************************************** */

console.log(botonRepetir.text);
/* document.getElementById("fondo-input").addEventListener("change", function (e) {
  const file = e.target.files[0];
  console.log(file);
}); */

document
  .getElementById("musica-input")
  .addEventListener("change", function (e) {
    /* const file = e.target.file; */
    const files = Array.from(e.target.files);
    /* console.log(files); */
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const nombreCancion = file.name.replace(/\.[^/.]+$/, "");
      /* console.log(nombreCancion); */
      const separacionArchivo = nombreCancion.split("-");
      const parteAntesDelGuion = separacionArchivo[0];
      const parteDespuesDelGuion = separacionArchivo.slice(1).join("-");
      const datosCancion = {
        titulo: parteDespuesDelGuion || "Titulo Desconocido",
        nombre: parteAntesDelGuion || "Artista desconocido",
        archivo: file,
        imagenUrl:
          "https://img.freepik.com/fotos-premium/chica-anime-escuchando-musica-noche-lofi-triste_911078-5774.jpg",
      };

      canciones.push({
        ...datosCancion,
        fuente: url,
      });

      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.add(datosCancion);
      actualizarPlaylist();
    });
    console.log("se han añadido correctamente"); // Añadir clases de Bootstrap
    sacarTargeta();

    if (canciones.length === files.length) {
      actualizarInfoCancion();
    }

    inicializarSortable(); // Refrescar la UI
  });

function actualizarPlaylist() {
  /* actualizarOrden(); */
  console.log(playListContainer);
  playListContainer.innerHTML = "";

  // Si no hay canciones, mostramos el mensaje
  if (canciones.length === 0) {
    const liVacia = document.createElement("li");
    liVacia.id = "playlist-vacia";
    liVacia.textContent = "Todavía no has añadido ninguna canción";

    playListContainer.appendChild(liVacia);
    return;
  }

  /* foreach */
  canciones.forEach((cancionItem, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;

    const img = document.createElement("img");
    img.src = cancionItem.imagenUrl; //Imagen de la cancion

    /* img.alt = "Cover"; ponerlo para que predeterminado sea eso 
    img.width = 40;
    img.height = 40; */
    img.style.borderRadius = "15px"; // Redondear bordes
    img.style.marginRight = "5px";
    img.classList.add("active"); // Espacio entre la imagen y el texto
    const span = document.createElement("span");
    span.textContent = `${cancionItem.titulo} - ${cancionItem.nombre}`;
    //li.textContent = `${cancionItem.titulo} - ${cancionItem.nombre}`;
    /* borrar cancion */
    const botonBorrar = document.createElement("button");
    botonBorrar.textContent = "🗑️";
    const botonMover = document.createElement("button");
    botonMover.textContent = "☰";
    botonMover.classList.add("boton-mover");
    /* al hacer click id */
    botonBorrar.addEventListener("click", (event) => {
      event.stopPropagation();
      borrarCancion(cancionItem.id);
    });

    li.appendChild(img);
    li.appendChild(span);
    li.appendChild(botonBorrar);
    li.appendChild(botonMover);

    li.onclick = () => {
      indiceCancionActual = index;
      actualizarInfoCancion();
      reproducirCancion();
      Sara();
    };
    /* para resaltar la cancion seleccionada  */
    if (index == indiceCancionActual) {
      const divReproduciendo = document.createElement("div");
      divReproduciendo.classList.add("loader");
      span.appendChild(divReproduciendo);
      li.classList.add("active");
      console.log("hola esto esta reproduciendo");
    }

    playListContainer.appendChild(li);
  });
}
/* funcion borrar cancion */
function borrarCancion(id) {
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  store.delete(id);

  transaction.oncomplete = () => {
    canciones = canciones.filter((cancion) => cancion.id !== id);
    actualizarPlaylist();
  };
}

let canciones = [];

let indiceCancionActual = 0;
let modoAleatorio = false;
let modoRepetir = false;

function actualizarInfoCancion() {
  console.log("esta es mi funcion2");
  tituloCancion.textContent = canciones[indiceCancionActual].titulo;
  nombreArtista.textContent = canciones[indiceCancionActual].nombre;
  cancion.src = canciones[indiceCancionActual].fuente;
  cancion.loop = modoRepetir;
  actualizarPlaylist();
  Sara();
  cancion.addEventListener("loadeddata", function () {});
  // Cuando el control de volumen cambie, ajusta el volumen del audio
  controlVolumen.addEventListener("input", function () {
    cancion.volume = controlVolumen.value;
    // Asigna el valor del rango al volumen del audio
    let valor = ((this.value - this.min) / (this.max - this.min)) * 100;
    this.style.background = `linear-gradient(to right, #FFFAFA ${valor}%, #272727 ${valor}%)`;
  });

  // Opcional: si quieres cambiar el valor del slider cuando el volumen del audio cambia, usa:
  cancion.addEventListener("volumechange", function () {
    controlVolumen.value = cancion.volume;
  });
}

/* progreso maximo */

cancion.addEventListener("loadedmetadata", function () {
  progreso.max = cancion.duration;
  progreso.value = cancion.currentTime;

  actualizarMinutosRestantes();
});

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
  cancion.play();
  document.querySelector(".loader").style.animationPlayState = "running";
  iconoControl.classList.add("bi-pause-circle-fill");
  iconoControl.classList.remove("bi-play-circle-fill");
}

function pausarCancion() {
  cancion.pause();
  document.querySelector(".loader").style.animationPlayState = "paused";
  iconoControl.classList.remove("bi-pause-circle-fill");
  iconoControl.classList.add("bi-play-circle-fill");
}

cancion.addEventListener("timeupdate", function () {
  if (!cancion.paused) {
    progreso.value = cancion.currentTime;
    // Calcula el porcentaje del progreso
    const porcentaje =
      ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;

    // Aplica el fondo con el gradiente
    progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
    actualizarMinutosRestantes();
  }
});

progreso.addEventListener("input", function () {
  cancion.currentTime = progreso.value;
  // Calcula el porcentaje según el valor actual
  const porcentaje =
    ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;

  // Aplica el fondo con el gradiente, coloreando desde la izquierda hasta el valor actual
  progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
});

/* progreso.addEventListener("change", function () {
  reproducirCancion();
}); */

botonAdelante.addEventListener("click", function () {
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

botonAtras.addEventListener("click", function () {
  console.log(indiceCancionActual);
  if (modoAleatorio) {
    indiceCancionActual = obtenerIndiceAleatorio();
  } else {
    indiceCancionActual = (indiceCancionActual - 1) % canciones.length;
  }
  actualizarInfoCancion();
  reproducirCancion();
});

/* Boton aleatorio */

botonAleatorio.addEventListener("click", function () {
  modoAleatorio = !modoAleatorio;
  console.log(modoAleatorio);
  botonAleatorio.classList.toggle("active");
  cancion.loop = modoRepetir;
});

cancion.addEventListener("ended", function () {
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
  // Si hemos llegado al final de la lista, vuelve al principio
  if (indiceCancionActual === canciones.length) {
    indiceCancionActual = 0; // Reinicia al inicio de la lista
  }
  actualizarInfoCancion();
  reproducirCancion();
});
obtenerIndiceAleatorio();

/* funcion aleatorio */
function obtenerIndiceAleatorio() {
  let nuevoIndice;
  do {
    nuevoIndice = Math.floor(Math.random() * canciones.length);
  } while (nuevoIndice === indiceCancionActual && canciones.length > 1);
  return nuevoIndice;
}

/* Boton repetir */

botonRepetir.addEventListener("click", function () {
  console.log("entrando");
  modoRepetir = !modoRepetir;
  botonRepetir.classList.toggle("active");
});

actualizarInfoCancion();
const event = new MouseEvent("botonRepetir", function () {
  console.log("derecho");
});
console.log(typeof lottie);

/* funcion actualizar los minutos */
function actualizarMinutosRestantes() {
  let tiempoRestante = cancion.duration - cancion.currentTime;
  let minutos = Math.floor((cancion.duration - cancion.currentTime) / 60);
  let segundos = Math.floor(tiempoRestante % 60)
    .toString()
    .padStart(2, "0"); // Asegura que siempre haya dos dígitos en los segundos
  divMinutos.textContent = `${minutos} : ${segundos}`;
}
function inicializarSortable() {
  new Sortable(playListContainer, {
    animation: 150,
    onEnd: function () {
      const nuevoOrden = Array.from(playListContainer.children).map((li) => {
        return canciones[li.dataset.index];
      });

      if (nuevoOrden.length === canciones.length) {
        canciones = [...nuevoOrden];
        actualizarPlaylist();
      }
    },
  });
}
/* FUNCIONA TODO menos el mover las canciones. para eso quitar funciones de indexeddb */
