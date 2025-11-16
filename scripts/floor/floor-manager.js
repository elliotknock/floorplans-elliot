// floor-manager.js - Optimized Multi-Floor System
export class FloorManager {
  constructor(fabricCanvas, enhancedSaveSystem) {
    this.fabricCanvas = fabricCanvas;
    this.enhancedSaveSystem = enhancedSaveSystem;
    this.floors = new Map();
    this.currentFloor = 1;
    this.maxFloors = 24;
    this.isLoading = false;

    this.initializeFloorSystem();
    this.setupFloorControls();
    this.integrateSaveSystem();
  }

  // Sets up the floor system when starting
  initializeFloorSystem() {
    this.ensureFloor1Exists();
  }

  // Gets all the current global settings from window
  getCurrentGlobalSettings() {
    const defaults = {
      globalIconTextVisible: true,
      globalDeviceColor: "#f8794b",
      globalTextColor: "#FFFFFF",
      globalFont: "Poppins, sans-serif",
      globalTextBackground: true,
      globalBoldText: false,
      globalCompleteDeviceIndicator: true,
      defaultDeviceIconSize: 30,
    };
    const booleanKeys = new Set(["globalIconTextVisible", "globalTextBackground", "globalBoldText", "globalCompleteDeviceIndicator"]);
    return Object.keys(defaults).reduce((settings, key) => {
      if (window[key] !== undefined) {
        settings[key] = booleanKeys.has(key) ? !!window[key] : window[key];
      } else {
        settings[key] = defaults[key];
      }
      return settings;
    }, {});
  }

  // Pulls out only the global settings from saved data
  extractGlobalSettings(settings = {}) {
    const booleanKeys = new Set(["globalIconTextVisible", "globalTextBackground", "globalBoldText", "globalCompleteDeviceIndicator"]);
    const validKeys = ["globalIconTextVisible", "globalDeviceColor", "globalTextColor", "globalFont", "globalTextBackground", "globalBoldText", "globalCompleteDeviceIndicator", "defaultDeviceIconSize"];
    return validKeys.reduce((extracted, key) => {
      if (settings[key] !== undefined) {
        extracted[key] = booleanKeys.has(key) ? !!settings[key] : settings[key];
      }
      return extracted;
    }, {});
  }

  // Connects the floor system with the save system
  integrateSaveSystem() {
    this.originalSaveProject = this.enhancedSaveSystem.saveProject.bind(this.enhancedSaveSystem);
    this.originalLoadProject = this.enhancedSaveSystem.loadProject.bind(this.enhancedSaveSystem);
    this.enhancedSaveSystem.saveProject = () => this.saveProjectWithFloors();
    this.enhancedSaveSystem.loadProject = (file) => this.loadProjectWithFloors(file);
  }

  // Saves the project with all floor data
  saveProjectWithFloors() {
    try {
      this.ensureFloor1Exists();
      this.saveCurrentFloorState();
      const projectData = {
        version: "4.0",
        timestamp: new Date().toISOString(),
        floors: { floors: Object.fromEntries(this.floors), currentFloor: this.currentFloor, floorCount: this.floors.size },
        clientDetails: this.enhancedSaveSystem.serializeClientDetails(),
        screenshots: this.enhancedSaveSystem.serializeScreenshots(),
      };
      this.enhancedSaveSystem.downloadFile(projectData, `project_floors_${new Date().toISOString().split("T")[0]}.json`);
      this.showNotification("Project with floors saved successfully!", true);
      return true;
    } catch (error) {
      this.handleError("Error saving project", error);
      return false;
    }
  }

  // Loads a project file and handles both single and multi-floor projects
  loadProjectWithFloors(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          window.isLoadingProject = true;
          const projectData = JSON.parse(e.target.result);
          if (window.undoSystem) window.undoSystem.reinitialize();

          if (projectData.floors?.floors) {
            await this.loadMultiFloorProject(projectData);
          } else {
            await this.loadSingleFloorProject(file);
          }

          this.updateFloorUI();
          this.finalizeProjectLoad();
          resolve(true);
        } catch (error) {
          this.handleError("Error loading project", error);
          reject(error);
        }
      };
      reader.onerror = () => {
        this.showNotification("Error reading file", false);
        reject(new Error("Error reading file"));
      };
      reader.readAsText(file);
    });
  }

  // Finishes loading a project and shows success message
  finalizeProjectLoad() {
    if (window.undoSystem) window.undoSystem.enableTracking();
    if (window.canvasSnapping?.clearSnapLines) window.canvasSnapping.clearSnapLines();
    this.showNotification("Project loaded successfully!", true);
    window.isLoadingProject = false;
  }

  // Loads a project that has multiple floors
  async loadMultiFloorProject(projectData) {
    this.floors.clear();
    this.isLoading = true;
    this.clearCanvas();

    Object.entries(projectData.floors.floors).forEach(([floorNumber, floorData]) => {
      this.floors.set(parseInt(floorNumber), floorData);
    });

    const targetFloor = projectData.floors.currentFloor || 1;
    this.currentFloor = targetFloor;
    this.isLoading = false;

    const targetFloorData = this.floors.get(targetFloor);
    if (targetFloorData) await this.loadFloorState(targetFloorData);

    if (projectData.clientDetails) await this.enhancedSaveSystem.loadClientDetailsToSidebar(projectData.clientDetails);
    if (projectData.screenshots) await this.enhancedSaveSystem.loadScreenshotsToSidebar(projectData.screenshots);
  }

  // Loads an old project that only has one floor
  async loadSingleFloorProject(file) {
    this.clearCanvas();
    await this.originalLoadProject.call(this.enhancedSaveSystem, file);
    this.floors.clear();
    this.currentFloor = 1;
    this.saveCurrentFloorState();
  }

  // Saves the current floor's state to memory
  saveCurrentFloorState() {
    if (this.isLoading || !this.floors.has(this.currentFloor)) return false;
    try {
      const projectState = this.getCurrentProjectState();
      const existingFloorData = this.floors.get(this.currentFloor);
      const floorName = existingFloorData?.name || `Floor ${this.currentFloor}`;
      this.floors.set(this.currentFloor, { ...projectState, floorNumber: this.currentFloor, lastModified: Date.now(), name: floorName });
      this.updateFloorUI();
      return true;
    } catch (error) {
      console.error("Error saving floor state:", error);
      return false;
    }
  }

  // Makes sure floor 1 always exists
  ensureFloor1Exists() {
    if (!this.floors.has(1)) {
      this.currentFloor = 1;
      this.createNewFloor(1);
      this.updateFloorUI();
    }
  }

  // Gets all the current project data from the canvas
  getCurrentProjectState() {
    const coverageStates = this.prepareCoverageForSerialization();
    const cameraData = this.enhancedSaveSystem.cameraSerializer.serializeCameraDevices();
    const drawingData = this.enhancedSaveSystem.drawingSerializer.serializeDrawingObjects();
    const backgroundData = this.serializeBackgroundObjects();
    this.restoreCoverageAfterSerialization(coverageStates);

    return {
      cameras: cameraData,
      drawing: drawingData,
      background: backgroundData,
      settings: { pixelsPerMeter: this.fabricCanvas.pixelsPerMeter || 17.5, zoom: this.fabricCanvas.getZoom(), viewportTransform: [...this.fabricCanvas.viewportTransform], defaultDeviceIconSize: window.defaultDeviceIconSize || 30, ...this.getCurrentGlobalSettings() },
      counters: { cameraCounter: window.cameraCounter || 1, deviceCounter: window.deviceCounter || 1 },
      globalState: { zones: window.zones || [], rooms: window.rooms || [] },
    };
  }

  // Saves background images to the floor data
  serializeBackgroundObjects() {
    const backgroundObjects = this.fabricCanvas.getObjects().filter((obj) => obj.isBackground || (obj.type === "image" && !obj.selectable && !obj.evented));
    return backgroundObjects.length > 0 ? this.fabricCanvas.toJSON(["isBackground", "pixelsPerMeter"]) : null;
  }

  // Hides camera coverage areas before saving
  prepareCoverageForSerialization() {
    const coverageStates = new Map();
    this.fabricCanvas.getObjects().forEach((obj) => {
      if (obj.type === "group" && obj.deviceType && obj.coverageConfig) {
        const state = { coverageVisible: obj.coverageArea?.visible || false, leftIconVisible: obj.leftResizeIcon?.visible || false, rightIconVisible: obj.rightResizeIcon?.visible || false, rotateIconVisible: obj.rotateResizeIcon?.visible || false };
        coverageStates.set(obj, state);
        [obj.coverageArea, obj.leftResizeIcon, obj.rightResizeIcon, obj.rotateResizeIcon].filter(Boolean).forEach((item) => this.fabricCanvas.remove(item));
      }
    });
    return coverageStates;
  }

  // Shows camera coverage areas after loading
  restoreCoverageAfterSerialization(coverageStates) {
    coverageStates.forEach((state, obj) => {
      if (obj.coverageArea) {
        this.fabricCanvas.add(obj.coverageArea);
        obj.coverageArea.set({ visible: state.coverageVisible });
        try {
          const deviceIndex = this.fabricCanvas.getObjects().indexOf(obj);
          if (deviceIndex !== -1) {
            this.fabricCanvas.remove(obj.coverageArea);
            this.fabricCanvas.insertAt(obj.coverageArea, deviceIndex);
          } else if (state.coverageVisible) obj.coverageArea.sendToBack();
        } catch (err) {
          console.warn("Failed to position restored coverage area:", err);
          if (state.coverageVisible) obj.coverageArea.sendToBack();
        }
      }
      ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((iconProp, index) => {
        const visibleKey = ["leftIconVisible", "rightIconVisible", "rotateIconVisible"][index];
        if (obj[iconProp]) {
          this.fabricCanvas.add(obj[iconProp]);
          obj[iconProp].set({ visible: state[visibleKey] });
          if (state[visibleKey]) obj[iconProp].bringToFront();
        }
      });
    });
    this.fabricCanvas.renderAll();
  }

  // Switches to a different floor
  async switchToFloor(floorNumber) {
    if (floorNumber === this.currentFloor) return true;
    if (!this.floors.has(floorNumber)) {
      this.showNotification(`Floor ${floorNumber} does not exist`, false);
      return false;
    }
    try {
      if (!this.isLoading) this.saveCurrentFloorState();
      if (window.undoSystem) window.undoSystem.reinitialize();
      this.clearCanvas();
      this.currentFloor = floorNumber;
      const targetFloorData = this.floors.get(floorNumber);

      // Apply current global settings to ALL floors and update the target floor
      const currentGlobalSettings = this.getCurrentGlobalSettings();
      this.applyGlobalSettingsToAllFloors(currentGlobalSettings);

      await this.loadFloorState(targetFloorData);
      this.updateFloorUI();
      this.finalizeFloorSwitch();
      return true;
    } catch (error) {
      this.handleError(`Error switching to Floor ${floorNumber}`, error);
      return false;
    }
  }

  // Finishes switching floors and updates the UI
  finalizeFloorSwitch() {
    this.fabricCanvas.discardActiveObject();
    this.fabricCanvas.renderAll();
    if (window.hideDeviceProperties) window.hideDeviceProperties();
    if (window.undoSystem) window.undoSystem.enableTracking();
    this.showNotification(`Switched to Floor ${this.currentFloor}`, true);
  }

  // Updates global settings on all floors to keep them the same
  applyGlobalSettingsToAllFloors(globalSettings) {
    this.floors.forEach((floorData, floorNumber) => {
      if (floorData.settings) {
        floorData.settings = { ...floorData.settings, ...globalSettings };
      }
    });
  }

  // Called when global settings change to update all floors
  onGlobalSettingsChanged() {
    const currentGlobalSettings = this.getCurrentGlobalSettings();
    this.applyGlobalSettingsToAllFloors(currentGlobalSettings);
  }

  // Forces all floors to use the same global settings
  syncGlobalSettingsToAllFloors() {
    const currentGlobalSettings = this.getCurrentGlobalSettings();
    this.applyGlobalSettingsToAllFloors(currentGlobalSettings);
    console.log("Global settings synced to all floors:", currentGlobalSettings);
  }

  // Creates a new empty floor
  createNewFloor(floorNumber) {
    const emptyFloorState = {
      cameras: { cameraDevices: [], counters: { cameraCounter: 1, deviceCounter: 1 }, canvasSettings: { pixelsPerMeter: 17.5, zoom: 1, viewportTransform: [1, 0, 0, 1, 0, 0] } },
      drawing: { drawingObjects: [], zones: [], rooms: [], walls: { circles: [], lines: [] }, titleblocks: [], canvasSettings: { pixelsPerMeter: 17.5, zoom: 1, viewportTransform: [1, 0, 0, 1, 0, 0] }, globalState: { zonesArray: [], roomsArray: [] } },
      background: null,
      settings: { pixelsPerMeter: 17.5, zoom: 1, viewportTransform: [1, 0, 0, 1, 0, 0], defaultDeviceIconSize: 30, ...this.getCurrentGlobalSettings() },
      counters: { cameraCounter: 1, deviceCounter: 1 },
      globalState: { zones: [], rooms: [] },
      floorNumber: floorNumber,
      lastModified: Date.now(),
      name: `Floor ${floorNumber}`,
    };
    this.floors.set(floorNumber, emptyFloorState);
  }

  // Clears everything from the canvas
  clearCanvas() {
    if (window.topologyManager?.clearAllConnections) {
      try {
        window.topologyManager.clearAllConnections();
      } catch (_) {}
    }
    this.fabricCanvas.getObjects().forEach((obj) => {
      if (obj.type === "group" && obj.deviceType && obj.coverageConfig) {
        ["added", "modified", "moving", "selected", "deselected"].forEach((event) => {
          const handler = obj[`${event}Handler`];
          if (handler) this.fabricCanvas.off(`object:${event}`, handler);
        });
        obj.coverageConfig = null;
        obj.coverageArea = null;
        obj.leftResizeIcon = null;
        obj.rightResizeIcon = null;
        obj.rotateResizeIcon = null;
      }
    });
    this.fabricCanvas.discardActiveObject();
    this.fabricCanvas.clear();
    Object.assign(window, { cameraCounter: 1, deviceCounter: 1, zones: [], rooms: [] });
    if (window.layers)
      Object.keys(window.layers).forEach((layerName) => {
        window.layers[layerName].objects = [];
      });
    this.fabricCanvas.requestRenderAll();
  }

  // Loads all the data for a specific floor
  async loadFloorState(floorData) {
    try {
      this.applyFloorSettings(floorData.settings);
      this.restoreCountersAndGlobalState(floorData);
      await this.loadBackground(floorData.background);
      await this.delay(100);
      if (floorData.drawing) {
        await this.enhancedSaveSystem.drawingSerializer.loadDrawingObjects(floorData.drawing);
      }
      await this.delay(200);
      await this.loadDevicesWithCoverage(floorData.cameras);
      await this.loadTopologyConnections(floorData);
      if (window.initCanvasLayers) window.initCanvasLayers(this.fabricCanvas);
      this.scheduleFinalCleanup(floorData);
    } catch (error) {
      console.error("Error loading floor state:", error);
      throw error;
    }
  }

  // Applies saved settings to the canvas
  applyFloorSettings(settings) {
    if (!settings) return;
    const { pixelsPerMeter, zoom, viewportTransform, defaultDeviceIconSize } = settings;
    this.fabricCanvas.pixelsPerMeter = pixelsPerMeter || 17.5;
    window.defaultDeviceIconSize = defaultDeviceIconSize || 30;

    // Apply ALL global settings from the floor data
    const globalSettings = this.extractGlobalSettings(settings);
    if (Object.keys(globalSettings).length > 0) {
      // Apply ALL global settings to window
      Object.assign(window, globalSettings);

      // Create settings payload for UI updates with ALL settings
      window.pendingGlobalSettings = {
        defaultDeviceIconSize: window.defaultDeviceIconSize,
        ...globalSettings,
      };

      // Apply settings to UI
      if (window.globalSettingsAPI?.applySettingsFromSave) {
        window.globalSettingsAPI.applySettingsFromSave(window.pendingGlobalSettings);
        setTimeout(() => {
          if (window.globalSettingsAPI?.applySettingsFromSave) {
            window.globalSettingsAPI.applySettingsFromSave(window.pendingGlobalSettings);
            window.pendingGlobalSettings = null;
          }
        }, 50);
      }
    }

    if (typeof zoom === "number") this.fabricCanvas.setZoom(zoom);
    if (Array.isArray(viewportTransform)) this.fabricCanvas.setViewportTransform(viewportTransform);
  }

  // Restores counters and global state from saved data
  restoreCountersAndGlobalState(floorData) {
    if (floorData.counters) Object.assign(window, floorData.counters);
    if (floorData.globalState) {
      window.zones = floorData.globalState.zones || [];
      window.rooms = floorData.globalState.rooms || [];
    }
  }

  // Loads background images for the floor
  async loadBackground(backgroundData) {
    if (!backgroundData?.objects) return;
    const backgroundObjects = backgroundData.objects.filter((obj) => obj.type === "image" && (obj.isBackground || (!obj.selectable && !obj.evented)));
    if (backgroundObjects.length === 0) return;
    return new Promise((resolve) => {
      this.fabricCanvas.loadFromJSON({ version: backgroundData.version, objects: backgroundObjects }, () => {
        this.fabricCanvas.getObjects().forEach((obj) => {
          if (obj.isBackground) {
            obj.set({ selectable: false, evented: false, hoverCursor: "default" });
            this.fabricCanvas.sendToBack(obj);
          }
        });
        this.fabricCanvas.requestRenderAll();
        resolve();
      });
    });
  }

  // Loads camera devices and their coverage areas
  async loadDevicesWithCoverage(camerasData) {
    if (!camerasData?.cameraDevices?.length) return;
    window.isLoadingFloor = true;
    const originalAddCoverage = window.addCameraCoverage;
    window.addCameraCoverage = () => {};
    for (let i = 0; i < camerasData.cameraDevices.length; i++) {
      try {
        await this.enhancedSaveSystem.cameraSerializer.loadCameraDevice(camerasData.cameraDevices[i], true);
        if (i < camerasData.cameraDevices.length - 1) await this.delay(50);
      } catch (error) {
        console.error(`Failed to load device ${i + 1}:`, error);
      }
    }
    await this.delay(100);
    window.isLoadingFloor = false;
    window.addCameraCoverage = originalAddCoverage;
    const cameraDevices = this.fabricCanvas.getObjects().filter((obj) => obj.type === "group" && obj.deviceType && obj.coverageConfig);
    for (const device of cameraDevices) {
      if (device.coverageConfig && originalAddCoverage) {
        [device.coverageArea, device.leftResizeIcon, device.rightResizeIcon, device.rotateResizeIcon].filter(Boolean).forEach((item) => this.fabricCanvas.remove(item));
        originalAddCoverage(this.fabricCanvas, device);
        await this.delay(10);
        ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((iconProp) => {
          if (device[iconProp]) {
            device[iconProp].set({ visible: false });
            device[iconProp].visible = false;
            device[iconProp].evented = true;
          }
        });
        if (device.coverageArea) {
          const shouldBeVisible = device.coverageConfig.visible !== false;
          device.coverageArea.set({ visible: shouldBeVisible });
        }
      }
    }
    this.fabricCanvas.discardActiveObject();
  }

  // Loads network connections between devices
  async loadTopologyConnections(floorData) {
    try {
      const topologyData = floorData.drawing?.topology || floorData.topology;
      if (topologyData && window.topologyManager && Array.isArray(topologyData)) {
        await this.delay(50);
        window.topologyManager.loadConnectionsData(topologyData);
      }
    } catch (e) {
      console.warn("Failed to load floor topology", e);
    }
  }

  // Runs cleanup tasks after loading a floor
  scheduleFinalCleanup(floorData) {
    setTimeout(() => {
      this.cleanupOrphanedResizeIcons();
      this.forceHideAllResizeIcons();
      this.setupDeferredEventHandlers();
      this.fabricCanvas.discardActiveObject();
      if (window.hideDeviceProperties) window.hideDeviceProperties();
      if (typeof window.updateZoomDisplay === "function") window.updateZoomDisplay();
      if (window.pendingGlobalSettings && window.globalSettingsAPI?.applySettingsFromSave) window.globalSettingsAPI.applySettingsFromSave(window.pendingGlobalSettings);
      this.fabricCanvas.requestRenderAll();
    }, 300);
  }

  // Hides all resize icons on devices
  forceHideAllResizeIcons() {
    const cameraDevices = this.fabricCanvas.getObjects().filter((obj) => obj.type === "group" && obj.deviceType && obj.coverageConfig);
    cameraDevices.forEach((device) => {
      ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((iconProp) => {
        if (device[iconProp]) {
          device[iconProp].set({ visible: false });
          device[iconProp].visible = false;
          device[iconProp].evented = true;
        }
      });
    });
    const standaloneResizeIcons = this.fabricCanvas.getObjects().filter((obj) => obj.isResizeIcon === true);
    standaloneResizeIcons.forEach((icon) => {
      icon.set({ visible: false });
      icon.visible = false;
    });
  }

  // Sets up event handlers for devices after loading
  setupDeferredEventHandlers() {
    const devicesWithDeferredHandlers = this.fabricCanvas.getObjects().filter((obj) => obj.type === "group" && obj.deviceType && obj._deferEventHandlers);
    devicesWithDeferredHandlers.forEach((device) => {
      if (this.enhancedSaveSystem.cameraSerializer.addDeviceEventHandlers) this.enhancedSaveSystem.cameraSerializer.addDeviceEventHandlers(device);
      delete device._deferEventHandlers;
      ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((iconProp) => {
        if (device[iconProp]) device[iconProp].evented = true;
      });
    });
  }

  // Removes resize icons that don't belong to any device
  cleanupOrphanedResizeIcons() {
    const allObjects = this.fabricCanvas.getObjects();
    const deviceGroups = allObjects.filter((obj) => obj.type === "group" && obj.deviceType);
    const resizeIcons = allObjects.filter((obj) => obj.isResizeIcon === true);
    resizeIcons.forEach((icon) => {
      const belongsToDevice = deviceGroups.some((device) => [device.leftResizeIcon, device.rightResizeIcon, device.rotateResizeIcon].includes(icon));
      if (!belongsToDevice) this.fabricCanvas.remove(icon);
    });
    const coverageAreas = allObjects.filter((obj) => obj.isCoverage || (obj.type === "polygon" && obj.fill?.includes("165, 155, 155")));
    coverageAreas.forEach((area) => {
      const belongsToDevice = deviceGroups.some((device) => device.coverageArea === area);
      if (!belongsToDevice) this.fabricCanvas.remove(area);
    });
  }

  // Sets up the floor control buttons
  setupFloorControls() {
    this.setupFloorEventListeners();
    this.updateFloorUI();
  }

  // Sets up click handlers for floor buttons
  setupFloorEventListeners() {
    const handlers = { "floor-prev": () => this.navigateFloor(-1), "floor-next": () => this.navigateFloor(1), "floor-add": () => this.addNewFloor(), "floor-delete": () => this.deleteCurrentFloor(), "floor-rename": () => this.renameCurrentFloor() };
    Object.entries(handlers).forEach(([id, handler]) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener("click", handler);
    });
  }

  // Moves to the previous or next floor
  navigateFloor(direction) {
    const existingFloors = Array.from(this.floors.keys()).sort((a, b) => a - b);
    const currentIndex = existingFloors.indexOf(this.currentFloor);
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < existingFloors.length) this.switchToFloor(existingFloors[newIndex]);
  }

  // Updates the floor display and button states
  updateFloorUI() {
    const floorDisplay = document.getElementById("floor-display");
    if (floorDisplay) {
      const currentFloorData = this.floors.get(this.currentFloor);
      const displayName = currentFloorData?.name || `Floor ${this.currentFloor}`;
      floorDisplay.textContent = displayName;
    }
    const existingFloors = Array.from(this.floors.keys()).sort((a, b) => a - b);
    const currentIndex = existingFloors.indexOf(this.currentFloor);
    const prevBtn = document.getElementById("floor-prev");
    const nextBtn = document.getElementById("floor-next");
    const deleteBtn = document.getElementById("floor-delete");
    if (prevBtn) prevBtn.disabled = currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentIndex >= existingFloors.length - 1;
    if (deleteBtn) deleteBtn.disabled = this.floors.size <= 1;
    this.updateQuickJumpButtons();
  }

  // Updates the quick jump buttons for floors
  updateQuickJumpButtons() {
    const quickJumpContainer = document.getElementById("floor-quick-jump");
    if (!quickJumpContainer) return;
    quickJumpContainer.innerHTML = "";
    const existingFloors = Array.from(this.floors.keys()).sort((a, b) => a - b);
    const maxFloor = Math.max(...existingFloors, 5);
    for (let floor = 1; floor <= maxFloor; floor++) {
      const button = document.createElement("button");
      const isCurrent = floor === this.currentFloor;
      const hasData = this.floors.has(floor);
      button.textContent = floor.toString();
      button.className = "btn btn-sm";
      if (hasData && !isCurrent) {
        button.classList.add("floor-available");
        this.styleFloorButton(button, "available");
        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.switchToFloor(floor);
        });
      } else if (hasData && isCurrent) {
        button.classList.add("current-floor");
        this.styleFloorButton(button, "current");
      } else {
        button.classList.add("floor-unavailable");
        this.styleFloorButton(button, "unavailable");
        button.disabled = true;
        button.title = `Floor ${floor} - Not created`;
      }
      quickJumpContainer.appendChild(button);
    }
  }

  // Styles the floor buttons based on their state
  styleFloorButton(button, type) {
    const baseStyle = "width: 35px; height: 30px; font-size: 0.8rem; border-radius: 0.25rem;";
    const styles = {
      available: `${baseStyle} background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: white; cursor: pointer;`,
      current: `${baseStyle} background: var(--orange-ip2); border: 1px solid var(--orange-ip2); color: white; cursor: default; opacity: 1;`,
      unavailable: `${baseStyle} background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.4); cursor: not-allowed; opacity: 0.5; pointer-events: none;`,
    };
    button.style.cssText = styles[type];
  }

  // Creates a new floor and switches to it
  addNewFloor() {
    let newFloorNumber = 1;
    while (this.floors.has(newFloorNumber) && newFloorNumber <= this.maxFloors) newFloorNumber++;
    if (newFloorNumber > this.maxFloors) {
      this.showNotification(`Maximum ${this.maxFloors} floors allowed`, false);
      return;
    }
    this.createNewFloor(newFloorNumber);
    this.switchToFloor(newFloorNumber);
  }

  // Deletes the current floor and switches to another one
  deleteCurrentFloor() {
    if (this.floors.size <= 1) {
      this.showNotification("Cannot delete the last floor", false);
      return;
    }
    const currentFloorData = this.floors.get(this.currentFloor);
    const floorName = currentFloorData?.name || `Floor ${this.currentFloor}`;
    if (!confirm(`Are you sure you want to delete ${floorName}? This action cannot be undone.`)) return;
    const floorToDelete = this.currentFloor;
    const availableFloors = Array.from(this.floors.keys()).sort((a, b) => a - b);
    const lowerFloors = availableFloors.filter((f) => f < floorToDelete);
    const higherFloors = availableFloors.filter((f) => f > floorToDelete);
    const targetFloor = lowerFloors.length > 0 ? Math.max(...lowerFloors) : Math.min(...higherFloors);
    this.isLoading = true;
    this.switchToFloor(targetFloor).then(() => {
      this.floors.delete(floorToDelete);
      this.isLoading = false;
      setTimeout(() => this.updateFloorUI(), 100);
    });
    this.showNotification(`${floorName} deleted`, true);
  }

  // Renames the current floor
  renameCurrentFloor() {
    const currentFloorData = this.floors.get(this.currentFloor);
    const currentName = currentFloorData?.name || `Floor ${this.currentFloor}`;
    const newName = prompt("Enter new floor name:", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      if (currentFloorData) {
        currentFloorData.name = newName.trim();
        this.updateFloorUI();
        this.showNotification(`Floor renamed to "${newName.trim()}"`, true);
      }
    }
  }

  // Shows a notification message to the user
  showNotification(message, isSuccess = true) {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 12px 24px; background: #f8794b; color: white; border-radius: 4px; z-index: 10000; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); transition: opacity 0.3s ease;`;
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => document.body.contains(notification) && document.body.removeChild(notification), 300);
    }, 3000);
  }

  // Handles errors and shows error messages
  handleError(message, error) {
    console.error(message, error);
    this.showNotification(`${message}: ${error.message}`, false);
  }

  // Waits for a specified number of milliseconds
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Public API methods
  // Gets the current floor number
  getCurrentFloor() {
    return this.currentFloor;
  }
  // Gets the total number of floors
  getFloorCount() {
    return this.floors.size;
  }
  // Gets a list of all floor numbers
  getFloorList() {
    return Array.from(this.floors.keys()).sort((a, b) => a - b);
  }
  // Checks if a floor exists
  hasFloor(floorNumber) {
    return this.floors.has(floorNumber);
  }
}

// Creates and initializes the floor manager
export function initFloorManager(fabricCanvas, enhancedSaveSystem) {
  const floorManager = new FloorManager(fabricCanvas, enhancedSaveSystem);
  window.floorManager = floorManager;
  // Make global settings sync method available globally
  window.syncGlobalSettingsToAllFloors = () => floorManager.syncGlobalSettingsToAllFloors();
  return floorManager;
}
