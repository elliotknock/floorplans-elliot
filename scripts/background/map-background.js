// Sets up the map background modal for Google Maps integration
export function initMapBackground(fabricCanvas, mainModal, updateStepIndicators, handleCrop, setBackgroundSource) {
  const elements = {
    mapModal: document.getElementById("mapModal"),
    mapBackBtn: document.getElementById("map-back-btn"),
    mapNextBtn: document.getElementById("map-next-btn"),
    addressInput: document.getElementById("maps-address-input"),
    mapTypeSelect: document.getElementById("map-type-select"),
    shapeSquareBtn: document.getElementById("shape-square-btn"),
    shapeRectBtn: document.getElementById("shape-rect-btn"),
    captureOverlay: document.getElementById("map-capture-overlay"),
  };

  let map,
    captureShape = "square";

  // Opens the map background modal
  const handleMapBackgroundSelection = () => {
    bootstrap.Modal.getInstance(mainModal)?.hide();
    setTimeout(() => {
      (bootstrap.Modal.getInstance(elements.mapModal) || new bootstrap.Modal(elements.mapModal)).show();
      updateStepIndicators(1);
      setTimeout(() => !map && initMap(), 300);
    }, 200);
  };

  // Handles the back button
  const handleMapBack = () => {
    bootstrap.Modal.getInstance(elements.mapModal)?.hide();
    (bootstrap.Modal.getInstance(mainModal) || new bootstrap.Modal(mainModal)).show();
    updateStepIndicators(1);
  };

  // Initializes the Google Map
  async function initMap() {
    try {
      const mapContainer = document.getElementById("map");
      if (!mapContainer) return;

      const { Map } = await google.maps.importLibrary("maps");
      const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");

      map = new Map(mapContainer, {
        center: { lat: 51.501414692425151, lng: -0.14187515932683303 },
        zoom: 18,
        mapTypeId: "satellite",
        tilt: 0,
        gestureHandling: "greedy",
        scaleControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
      });

      elements.mapTypeSelect?.addEventListener("change", () => map.setMapTypeId(elements.mapTypeSelect.value));
      updateCaptureFrameShape();

      if (elements.addressInput) {
        const placeAutocomplete = new PlaceAutocompleteElement({
          locationRestriction: { north: 85, south: -85, east: 180, west: -180 },
        });
        placeAutocomplete.id = "maps-address-input";
        placeAutocomplete.placeholder = "Enter address, building name or postcode...";
        Object.assign(placeAutocomplete.style, {
          width: "100%",
          height: "50px",
          padding: "0 1rem",
          border: "none",
          outline: "none",
          borderRadius: "0.5rem",
          fontSize: "1rem",
          boxSizing: "border-box",
        });

        elements.addressInput.parentNode.replaceChild(placeAutocomplete, elements.addressInput);

        const style = document.createElement("style");
        style.textContent = `gmp-place-autocomplete { width: 100% !important; height: 50px !important; display: block !important; box-sizing: border-box !important; margin: 0 !important; padding: 0 !important; }`;
        document.head.appendChild(style);

        placeAutocomplete.addEventListener("gmp-select", async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({ fields: ["formattedAddress", "location"] });
            if (!place.location) {
              alert("No details available for the selected place. Please try another.");
              return;
            }
            map.setCenter(place.location);
            map.setZoom(19);
            placeAutocomplete.value = place.formattedAddress;
          } catch {
            alert("Error selecting location. Please try again.");
          }
        });
      }
    } catch {
      alert("Error loading Google Maps. Please check your internet connection and try again.");
    }
  }

  // Updates the capture frame shape
  const updateCaptureFrameShape = () => {
    const frame = elements.captureOverlay?.querySelector(".capture-frame");
    if (!frame) return;
    frame.classList.remove("square", "rect");
    frame.classList.add(captureShape === "rect" ? "rect" : "square");
  };

  // Preloads a map image with timeout
  const preloadMapImage = (url, timeout = 15000) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const timeoutId = setTimeout(() => reject(new Error("Image loading timeout")), timeout);
      img.onload = () => {
        clearTimeout(timeoutId);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error("Image loading failed"));
      };
      img.crossOrigin = "anonymous";
      img.src = url;
    });

  // Handles the next button to capture the map
  function handleMapNext() {
    if (!map) {
      alert("Map not initialized. Please try again.");
      return;
    }

    if (elements.mapNextBtn) {
      elements.mapNextBtn.disabled = true;
      elements.mapNextBtn.innerHTML = `<div class="icon-label"><span>Loading...</span><div class="spinner-border spinner-border-sm" role="status"></div></div>`;
    }

    const center = map.getCenter();
    const zoom = map.getZoom();
    const mapType = elements.mapTypeSelect?.value || "satellite";

    let width = 1024,
      height = 1024;
    try {
      const frame = elements.captureOverlay?.querySelector(".capture-frame");
      if (frame) {
        const rect = frame.getBoundingClientRect();
        const maxSide = 1024;
        let w = Math.max(100, Math.round(rect.width));
        let h = Math.max(100, Math.round(rect.height));
        const scaleFactor = Math.min(maxSide / Math.max(w, h), 1);
        width = Math.max(100, Math.round(w * scaleFactor));
        height = Math.max(100, Math.round(h * scaleFactor));
      } else if (captureShape === "rect") {
        width = 1024;
        height = Math.round((1024 * 9) / 16);
      }
    } catch {}

    const apiKey = "AIzaSyAx4DsAED53aflbG2KqEirKkFE4jMa6qGQ";
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat()},${center.lng()}&zoom=${zoom}&size=${width}x${height}&scale=2&maptype=${mapType}&key=${apiKey}&format=jpg&quality=90`;

    preloadMapImage(staticMapUrl)
      .then(() => {
        bootstrap.Modal.getInstance(elements.mapModal)?.hide();
        setBackgroundSource("map");
        handleCrop(staticMapUrl);
        updateStepIndicators(2);
      })
      .catch(() => {
        const fallbackUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat()},${center.lng()}&zoom=${zoom}&size=${Math.min(width, 800)}x${Math.min(height, 800)}&scale=1&maptype=${mapType}&key=${apiKey}&format=jpg&quality=70`;
        preloadMapImage(fallbackUrl, 10000)
          .then(() => {
            bootstrap.Modal.getInstance(elements.mapModal)?.hide();
            setBackgroundSource("map");
            handleCrop(fallbackUrl);
            updateStepIndicators(2);
          })
          .catch(() => alert("Unable to load satellite image. Please try again later."));
      })
      .finally(() => {
        if (elements.mapNextBtn) {
          elements.mapNextBtn.disabled = false;
          elements.mapNextBtn.innerHTML = `<div class="icon-label"><span>Next</span><img src="images/icons/forward-black-arrow.svg" alt="Next Arrow" /></div>`;
        }
      });
  }

  // Sets the active capture shape
  const setActiveShape = (shape) => {
    captureShape = shape;
    updateCaptureFrameShape();
    elements.shapeSquareBtn?.classList.toggle("active", captureShape === "square");
    elements.shapeRectBtn?.classList.toggle("active", captureShape === "rect");
  };

  elements.shapeSquareBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    setActiveShape("square");
  });
  elements.shapeRectBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    setActiveShape("rect");
  });
  elements.mapBackBtn?.addEventListener("click", handleMapBack);
  elements.mapNextBtn?.addEventListener("click", handleMapNext);

  elements.mapModal?.addEventListener("shown.bs.modal", () => setTimeout(() => (!map ? initMap() : updateCaptureFrameShape()), 300));

  return { handleMapBackgroundSelection };
}
