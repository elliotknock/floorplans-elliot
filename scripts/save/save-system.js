import { ObjectTypeUtils, SerializationUtils, StyleConfig, NotificationSystem, ProjectUI, DrawingUtils } from "./utils-save.js";
import { CameraDeviceSerializer } from "./device-save.js";
import { DrawingObjectSerializer } from "./drawing-serializer.js";

class SaveSystem {
  constructor(fabricCanvas) {
    this.fabricCanvas = fabricCanvas;
    this.cameraSerializer = new CameraDeviceSerializer(fabricCanvas);
    this.drawingSerializer = new DrawingObjectSerializer(fabricCanvas);
  }

  // Public accessors used by other modules
  getCameraSerializer() {
    return this.cameraSerializer;
  }
  getDrawingSerializer() {
    return this.drawingSerializer;
  }

  // Sidebar data serialization (delegated)
  serializeClientDetails() {
    return ProjectUI.serializeClientDetails();
  }
  serializeScreenshots() {
    return ProjectUI.serializeScreenshots();
  }

  serializeTopologyData() {
    try {
      const connectionsData = window.topologyManager ? window.topologyManager.getConnectionsData() : [];
      let topologyMapPositions = {};

      // Try to get topology map positions
      if (window.topologyBuilderAPI && typeof window.topologyBuilderAPI.getTopologyPositions === "function") {
        try {
          topologyMapPositions = window.topologyBuilderAPI.getTopologyPositions() || {};
        } catch (e) {
          console.warn("Failed to get topology map positions:", e);
        }
      }

      return {
        connections: connectionsData,
        mapPositions: topologyMapPositions,
      };
    } catch (e) {
      console.error("Error serializing topology data:", e);
      return {
        connections: window.topologyManager ? window.topologyManager.getConnectionsData() : [],
        mapPositions: {},
      };
    }
  }

  downloadFile(data, filename) {
    SerializationUtils.downloadFile(data, filename);
  }

  // Saves the entire project to a JSON file
  saveProject() {
    try {
      const cameraData = this.cameraSerializer.serializeCameraDevices();
      const drawingData = this.drawingSerializer.serializeDrawingObjects();
      const clientDetails = this.serializeClientDetails();
      const screenshots = this.serializeScreenshots();

      // Serialize topology data with error handling
      let topologyData;
      try {
        topologyData = this.serializeTopologyData();
      } catch (e) {
        console.error("Error serializing topology data:", e);
        // Fallback to empty topology data if serialization fails
        topologyData = {
          connections: [],
          mapPositions: {},
        };
      }

      // Temporarily strip managed and drawing objects to serialize clean background
      const allObjects = this.fabricCanvas.getObjects();
      const managedObjects = allObjects.filter((obj) => ObjectTypeUtils.isManagedObject(obj));
      const drawingObjects = allObjects.filter((obj) => this.drawingSerializer.isDrawingObject(obj));
      const objectsToRemove = [...new Set([...managedObjects, ...drawingObjects])];
      const coverageStates = new Map();
      allObjects.forEach((obj) => {
        if (ObjectTypeUtils.isDevice(obj) && obj.coverageArea) {
          coverageStates.set(obj.id || obj, { visible: obj.coverageArea.visible });
          obj.coverageArea.set({ visible: true });
        }
      });
      objectsToRemove.forEach((obj) => this.fabricCanvas.remove(obj));
      const canvasData = this.fabricCanvas.toJSON(["class", "associatedText", "pixelsPerMeter", "isBackground"]);
      objectsToRemove.forEach((obj) => this.fabricCanvas.add(obj));
      allObjects.forEach((obj) => {
        if (ObjectTypeUtils.isDevice(obj) && obj.coverageArea) {
          const saved = coverageStates.get(obj.id || obj);
          if (saved) obj.coverageArea.set({ visible: saved.visible });
        }
      });

      const settings = {
        pixelsPerMeter: this.fabricCanvas.pixelsPerMeter || 17.5,
        zoom: this.fabricCanvas.getZoom(),
        viewportTransform: [...this.fabricCanvas.viewportTransform],
        defaultDeviceIconSize: window.defaultDeviceIconSize || 30,
        globalIconTextVisible: window.globalIconTextVisible !== undefined ? !!window.globalIconTextVisible : true,
        globalDeviceColor: window.globalDeviceColor || "#f8794b",
        globalTextColor: window.globalTextColor || "#FFFFFF",
        globalFont: window.globalFont || "Poppins, sans-serif",
        globalTextBackground: window.globalTextBackground !== undefined ? !!window.globalTextBackground : true,
        globalBoldText: window.globalBoldText !== undefined ? !!window.globalBoldText : false,
        globalCompleteDeviceIndicator: window.globalCompleteDeviceIndicator !== undefined ? !!window.globalCompleteDeviceIndicator : true,
        globalLabelDragEnabled: window.globalLabelDragEnabled !== undefined ? !!window.globalLabelDragEnabled : false,
      };

      const projectData = {
        version: "4.0",
        timestamp: new Date().toISOString(),
        cameras: cameraData,
        drawing: drawingData,
        canvas: canvasData,
        clientDetails,
        screenshots,
        topology: topologyData,
        settings,
      };

      // Validate that projectData can be serialized before attempting download
      try {
        JSON.stringify(projectData);
      } catch (e) {
        console.error("Project data contains non-serializable content:", e);
        NotificationSystem.show("Error: Project contains data that cannot be saved. Check console for details.", false);
        return false;
      }

      this.downloadFile(projectData, `project_${new Date().toISOString().split("T")[0]}.json`);
      NotificationSystem.show("Project saved successfully!", true);
      return true;
    } catch (error) {
      console.error("Error saving project:", error);
      NotificationSystem.show("Error saving project: " + error.message, false);
      return false;
    }
  }

  async loadClientDetailsToSidebar(clientDetails) {
    return ProjectUI.loadClientDetailsToSidebar(clientDetails);
  }

  async loadScreenshotsToSidebar(screenshots) {
    return ProjectUI.loadScreenshotsToSidebar(screenshots);
  }

  // Loads a saved project from a JSON file
  async loadProject(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          window.isLoadingProject = true;
          const projectData = JSON.parse(e.target.result);
          if (window.undoSystem) window.undoSystem.reinitialize();

          // Clear current canvas
          this.fabricCanvas.clear();
          this.fabricCanvas.getObjects().forEach((obj) => this.fabricCanvas.remove(obj));
          this.fabricCanvas.renderAll();
          window.zones = [];
          window.rooms = [];

          // Apply settings
          const savedSettings = projectData.settings || {};
          const savedZoom = typeof savedSettings.zoom === "number" ? savedSettings.zoom : null;
          const savedViewportTransform = Array.isArray(savedSettings.viewportTransform) ? [...savedSettings.viewportTransform] : null;
          const counters = projectData.cameras?.counters || {};
          Object.assign(window, {
            cameraCounter: counters.cameraCounter || 1,
            deviceCounter: counters.deviceCounter || 1,
            defaultDeviceIconSize: savedSettings.defaultDeviceIconSize || 30,
            globalIconTextVisible: savedSettings.globalIconTextVisible !== undefined ? !!savedSettings.globalIconTextVisible : true,
            globalDeviceColor: savedSettings.globalDeviceColor || "#f8794b",
            globalTextColor: savedSettings.globalTextColor || "#FFFFFF",
            globalFont: savedSettings.globalFont || "Poppins, sans-serif",
            globalTextBackground: savedSettings.globalTextBackground !== undefined ? !!savedSettings.globalTextBackground : true,
            globalBoldText: savedSettings.globalBoldText !== undefined ? !!savedSettings.globalBoldText : false,
            globalCompleteDeviceIndicator: savedSettings.globalCompleteDeviceIndicator !== undefined ? !!savedSettings.globalCompleteDeviceIndicator : true,
            globalLabelDragEnabled: savedSettings.globalLabelDragEnabled !== undefined ? !!savedSettings.globalLabelDragEnabled : false,
          });
          if (projectData.settings) {
            const { pixelsPerMeter, zoom, viewportTransform } = projectData.settings;
            this.fabricCanvas.pixelsPerMeter = pixelsPerMeter || 17.5;
            if (zoom) this.fabricCanvas.setZoom(zoom);
            if (viewportTransform) this.fabricCanvas.setViewportTransform(viewportTransform);
          }

          // Sidebar data
          if (projectData.clientDetails) await this.loadClientDetailsToSidebar(projectData.clientDetails);
          if (projectData.screenshots) await this.loadScreenshotsToSidebar(projectData.screenshots);

          // Background first
          if (projectData.canvas?.objects) {
            const backgroundObjects = projectData.canvas.objects.filter((obj) => obj.type === "image" && (obj.isBackground || (!obj.selectable && !obj.evented)));
            if (backgroundObjects.length > 0) {
              await new Promise((resolveCanvas) => {
                this.fabricCanvas.loadFromJSON({ version: projectData.canvas.version, objects: backgroundObjects }, () => {
                  this.fabricCanvas.getObjects().forEach((obj) => {
                    if (obj.isBackground) obj.set({ selectable: false, evented: false, hoverCursor: "default" });
                  });
                  this.fabricCanvas.requestRenderAll();
                  resolveCanvas();
                });
              });
            }
          }

          await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));

          // Drawing objects
          if (projectData.drawing) {
            try {
              await this.drawingSerializer.loadDrawingObjects(projectData.drawing);
            } catch (error) {
              console.error("Error loading drawing objects:", error);
            }
          }

          await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));

          // Devices
          const devices = projectData.cameras?.cameraDevices;
          if (devices?.length) {
            for (let i = 0; i < devices.length; i++) {
              try {
                await this.cameraSerializer.loadCameraDevice(devices[i]);
                if (i < devices.length - 1) await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
              } catch (error) {
                console.error(`Failed to load device ${i + 1}:`, error);
              }
            }
          }

          if (projectData.settings) {
            window.pendingGlobalSettings = projectData.settings;
            if (window.globalSettingsAPI?.applySettingsFromSave) {
              window.globalSettingsAPI.applySettingsFromSave(projectData.settings);
              setTimeout(() => {
                if (window.globalSettingsAPI?.applySettingsFromSave) {
                  window.globalSettingsAPI.applySettingsFromSave(projectData.settings);
                  window.pendingGlobalSettings = null;
                }
              }, 50);
            } else {
              const fallbackToggle = typeof document !== "undefined" ? document.getElementById("global-icon-text-toggle") : null;
              if (fallbackToggle && projectData.settings.globalIconTextVisible !== undefined) fallbackToggle.checked = !!projectData.settings.globalIconTextVisible;
            }
          }

          if (projectData.topology && window.topologyManager) {
            try {
              // Handle both old format (array) and new format (object with connections and mapPositions)
              if (Array.isArray(projectData.topology)) {
                // Old format - just connections
                window.topologyManager.loadConnectionsData(projectData.topology);
              } else {
                // New format - includes map positions
                if (projectData.topology.connections) {
                  window.topologyManager.loadConnectionsData(projectData.topology.connections);
                }
                // Restore topology map positions - wait a bit to ensure devices are loaded first
                if (projectData.topology.mapPositions) {
                  setTimeout(() => {
                    if (window.topologyBuilderAPI?.setTopologyPositions) {
                      try {
                        window.topologyBuilderAPI.setTopologyPositions(projectData.topology.mapPositions);
                      } catch (e) {
                        console.warn("Failed to restore topology map positions:", e);
                      }
                    }
                  }, 500);
                }
              }
            } catch (e) {
              console.error("Topology load failed:", e);
            }
          }

          // Final passes
          if (window.initCanvasLayers) window.initCanvasLayers(this.fabricCanvas);
          setTimeout(() => {
            if (savedZoom) this.fabricCanvas.setZoom(savedZoom);
            if (savedViewportTransform) this.fabricCanvas.setViewportTransform(savedViewportTransform);
            if (typeof window.updateZoomDisplay === "function") window.updateZoomDisplay();
            this.fabricCanvas.requestRenderAll();
            if (window.canvasSnapping?.clearSnapLines) window.canvasSnapping.clearSnapLines();
            if (window.undoSystem) setTimeout(() => window.undoSystem.enableTracking(), 100);
          }, 300);

          NotificationSystem.show("Project loaded successfully!", true);
          window.isLoadingProject = false;
          resolve(true);
        } catch (error) {
          console.error("Error loading project:", error);
          NotificationSystem.show("Error loading project: " + error.message, false);
          window.isLoadingProject = false;
          reject(error);
        }
      };
      reader.onerror = () => {
        NotificationSystem.show("Error reading file", false);
        reject(new Error("Error reading file"));
      };
      reader.readAsText(file);
    });
  }

  setupButtonIntegration() {
    const checkButtons = setInterval(() => {
      const saveButton = document.getElementById("save-project-btn");
      const loadButton = document.getElementById("load-project-btn");
      if (saveButton && loadButton) {
        clearInterval(checkButtons);
        const originalSaveHandler = saveButton.onclick;
        saveButton.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof originalSaveHandler === "function") {
            try {
              originalSaveHandler.call(saveButton, e);
            } catch (err) {
              console.warn("Original save handler failed:", err);
            }
          }
          this.saveProject();
          return false;
        };
        this.setupLoadButton(loadButton);
      }
    }, 100);
    setTimeout(() => clearInterval(checkButtons), 10000);
  }

  setupLoadButton(loadButton) {
    const existingFileInput = document.getElementById("load-project-input");
    if (existingFileInput) {
      const newFileInput = existingFileInput.cloneNode(true);
      existingFileInput.parentNode.replaceChild(newFileInput, existingFileInput);
      newFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file && confirm("This will replace the current project. Continue?")) {
          try {
            await this.loadProject(file);
          } catch (error) {
            console.error("Load failed:", error);
            NotificationSystem.show("Failed to load project: " + error.message, false);
          }
          newFileInput.value = "";
        }
      });
      const newLoadButton = loadButton.cloneNode(true);
      loadButton.parentNode.replaceChild(newLoadButton, loadButton);
      newLoadButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        newFileInput.click();
        return false;
      });
    } else {
      console.warn("Could not find existing load-project-input element");
    }
  }
}

export { SaveSystem };
