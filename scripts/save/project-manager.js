// Project Manager - Handles saving, loading, and managing projects with thumbnails
import { SaveSystem } from "./save-system.js";
import { NotificationSystem } from "./utils-save.js";

class ProjectManager {
  constructor(fabricCanvas, saveSystem) {
    this.fabricCanvas = fabricCanvas;
    this.saveSystem = saveSystem;
    this.storageKey = "floorplan_projects";
    this.templatesKey = "floorplan_templates";
    this.init();
  }

  init() {
    this.setupGalleryModal();
    this.setupEventListeners();
    this.loadDefaultTemplates();
  }

  // Generate thumbnail from canvas
  async generateThumbnail() {
    return new Promise((resolve) => {
      const canvas = this.fabricCanvas;
      const scale = 0.2; // Thumbnail scale
      const width = canvas.width * scale;
      const height = canvas.height * scale;

      // Create temporary canvas for thumbnail
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext("2d");

      // Get current viewport transform
      const vpt = canvas.viewportTransform;
      const zoom = canvas.getZoom();

      // Draw canvas content scaled down
      const dataURL = canvas.toDataURL({
        format: "png",
        quality: 0.8,
        multiplier: scale,
      });

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(tempCanvas.toDataURL("image/png"));
      };
      img.src = dataURL;
    });
  }

  // Save project with metadata and thumbnail
  async saveProjectToGallery(projectName, description = "") {
    try {
      // Get project data
      const cameraData = this.saveSystem.cameraSerializer.serializeCameraDevices();
      const drawingData = this.saveSystem.drawingSerializer.serializeDrawingObjects();
      const clientDetails = this.saveSystem.serializeClientDetails();
      const screenshots = this.saveSystem.serializeScreenshots();
      const topologyData = this.saveSystem.serializeTopologyData();

      // Get canvas data
      const allObjects = this.fabricCanvas.getObjects();
      // Import ObjectTypeUtils dynamically
      const { ObjectTypeUtils } = await import("./utils-save.js");
      const managedObjects = allObjects.filter((obj) => ObjectTypeUtils.isManagedObject(obj));
      const drawingObjects = allObjects.filter((obj) => 
        this.saveSystem.drawingSerializer.isDrawingObject(obj)
      );
      const objectsToRemove = [...new Set([...managedObjects, ...drawingObjects])];
      const coverageStates = new Map();
      
      allObjects.forEach((obj) => {
        if (obj.deviceType && obj.coverageArea) {
          coverageStates.set(obj.id || obj, { visible: obj.coverageArea.visible });
          obj.coverageArea.set({ visible: true });
        }
      });
      
      objectsToRemove.forEach((obj) => this.fabricCanvas.remove(obj));
      const canvasData = this.fabricCanvas.toJSON(["class", "associatedText", "pixelsPerMeter", "isBackground"]);
      objectsToRemove.forEach((obj) => this.fabricCanvas.add(obj));
      
      allObjects.forEach((obj) => {
        if (obj.deviceType && obj.coverageArea) {
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

      // Generate thumbnail
      const thumbnail = await this.generateThumbnail();

      // Create project metadata
      const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const projectMetadata = {
        id: projectId,
        name: projectName || `Project ${new Date().toLocaleDateString()}`,
        description: description,
        thumbnail: thumbnail,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        data: projectData,
      };

      // Save to localStorage
      const projects = this.getProjects();
      projects.push(projectMetadata);
      localStorage.setItem(this.storageKey, JSON.stringify(projects));

      NotificationSystem.show("Project saved to gallery!", true);
      return projectMetadata;
    } catch (error) {
      console.error("Error saving project to gallery:", error);
      NotificationSystem.show("Error saving project: " + error.message, false);
      return null;
    }
  }

  // Get all saved projects
  getProjects() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error loading projects:", error);
      return [];
    }
  }

  // Get all templates
  getTemplates() {
    try {
      const stored = localStorage.getItem(this.templatesKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error loading templates:", error);
      return [];
    }
  }

  // Load project from gallery
  async loadProjectFromGallery(projectId) {
    const projects = this.getProjects();
    const templates = this.getTemplates();
    const project = projects.find((p) => p.id === projectId) || templates.find((t) => t.id === projectId);
    
    if (!project) {
      NotificationSystem.show("Project not found", false);
      return false;
    }

    // Convert project data to File-like object for loadProject
    const projectDataStr = JSON.stringify(project.data);
    const blob = new Blob([projectDataStr], { type: "application/json" });
    const file = new File([blob], `${project.name}.json`, { type: "application/json" });

    try {
      await this.saveSystem.loadProject(file);
      NotificationSystem.show(`Project "${project.name}" loaded successfully!`, true);
      return true;
    } catch (error) {
      console.error("Error loading project:", error);
      NotificationSystem.show("Error loading project: " + error.message, false);
      return false;
    }
  }

  // Delete project
  deleteProject(projectId) {
    const projects = this.getProjects();
    const filtered = projects.filter((p) => p.id !== projectId);
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));
    NotificationSystem.show("Project deleted", true);
  }

  // Export project to file
  exportProject(projectId) {
    const projects = this.getProjects();
    const templates = this.getTemplates();
    const project = projects.find((p) => p.id === projectId) || templates.find((t) => t.id === projectId);
    
    if (!project) {
      NotificationSystem.show("Project not found", false);
      return;
    }

    const exportData = {
      ...project,
      exportedAt: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    NotificationSystem.show("Project exported successfully!", true);
  }

  // Import project from file
  async importProject(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          
          // Validate it's a project file
          if (!importedData.data || !importedData.name) {
            throw new Error("Invalid project file format");
          }

          // Create new project with imported data
          const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const projectMetadata = {
            ...importedData,
            id: projectId,
            importedAt: new Date().toISOString(),
            createdAt: importedData.createdAt || new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
          };

          // Add to projects
          const projects = this.getProjects();
          projects.push(projectMetadata);
          localStorage.setItem(this.storageKey, JSON.stringify(projects));

          NotificationSystem.show(`Project "${projectMetadata.name}" imported successfully!`, true);
          resolve(projectMetadata);
        } catch (error) {
          console.error("Error importing project:", error);
          NotificationSystem.show("Error importing project: " + error.message, false);
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

  // Export all projects as backup
  exportAllProjects() {
    const projects = this.getProjects();
    const templates = this.getTemplates();
    
    const backupData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      projects: projects,
      templates: templates,
    };

    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `floorplan_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    NotificationSystem.show("All projects exported as backup!", true);
  }

  // Import backup file
  async importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const backupData = JSON.parse(e.target.result);
          
          if (!backupData.projects && !backupData.templates) {
            throw new Error("Invalid backup file format");
          }

          let importedCount = 0;

          // Import projects
          if (backupData.projects && Array.isArray(backupData.projects)) {
            const existingProjects = this.getProjects();
            const existingIds = new Set(existingProjects.map(p => p.id));
            
            backupData.projects.forEach((project) => {
              if (!existingIds.has(project.id)) {
                project.importedAt = new Date().toISOString();
                existingProjects.push(project);
                importedCount++;
              }
            });
            
            localStorage.setItem(this.storageKey, JSON.stringify(existingProjects));
          }

          // Import templates
          if (backupData.templates && Array.isArray(backupData.templates)) {
            const existingTemplates = this.getTemplates();
            const existingIds = new Set(existingTemplates.map(t => t.id));
            
            backupData.templates.forEach((template) => {
              if (!existingIds.has(template.id)) {
                template.importedAt = new Date().toISOString();
                existingTemplates.push(template);
                importedCount++;
              }
            });
            
            localStorage.setItem(this.templatesKey, JSON.stringify(existingTemplates));
          }

          NotificationSystem.show(`Backup imported! ${importedCount} items added.`, true);
          resolve(importedCount);
        } catch (error) {
          console.error("Error importing backup:", error);
          NotificationSystem.show("Error importing backup: " + error.message, false);
          reject(error);
        }
      };
      reader.onerror = () => {
        NotificationSystem.show("Error reading backup file", false);
        reject(new Error("Error reading file"));
      };
      reader.readAsText(file);
    });
  }

  // Duplicate project
  duplicateProject(projectId) {
    const projects = this.getProjects();
    const project = projects.find((p) => p.id === projectId);
    
    if (!project) {
      NotificationSystem.show("Project not found", false);
      return;
    }

    const newProject = {
      ...project,
      id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${project.name} (Copy)`,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };

    projects.push(newProject);
    localStorage.setItem(this.storageKey, JSON.stringify(projects));
    NotificationSystem.show("Project duplicated!", true);
  }

  // Save as template
  async saveAsTemplate(templateName, description = "") {
    const projectMetadata = await this.saveProjectToGallery(templateName, description);
    if (!projectMetadata) return;

    const templates = this.getTemplates();
    templates.push(projectMetadata);
    localStorage.setItem(this.templatesKey, JSON.stringify(templates));
    NotificationSystem.show("Template saved!", true);
  }

  // Render projects grid
  renderProjects(projects, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    if (projects.length === 0) {
      const emptyState = document.getElementById("projects-empty-state");
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    const emptyState = document.getElementById("projects-empty-state");
    if (emptyState) emptyState.style.display = "none";

    const template = document.getElementById("project-card-template");
    if (!template) return;

    projects.forEach((project) => {
      const card = template.content.cloneNode(true);
      const cardElement = card.querySelector(".project-card");
      
      // Set thumbnail
      const thumbnailImg = card.querySelector(".thumbnail-image");
      if (thumbnailImg) thumbnailImg.src = project.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Crect fill='%23f0f0f0' width='200' height='150'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ENo Preview%3C/text%3E%3C/svg%3E";
      
      // Set title
      const title = card.querySelector(".project-card-title");
      if (title) title.textContent = project.name;
      
      // Set date
      const date = card.querySelector(".project-card-date");
      if (date) {
        const dateObj = new Date(project.modifiedAt || project.createdAt);
        date.textContent = dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      
      // Set description
      const description = card.querySelector(".project-card-description");
      if (description) description.textContent = project.description || "No description";

      // Set up buttons
      const openBtn = card.querySelector(".open-project-btn");
      if (openBtn) {
        openBtn.addEventListener("click", () => {
          this.loadProjectFromGallery(project.id).then(() => {
            const modal = bootstrap.Modal.getInstance(document.getElementById("projectGalleryModal"));
            if (modal) modal.hide();
          });
        });
      }

      const deleteBtn = card.querySelector(".delete-project-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${project.name}"?`)) {
            this.deleteProject(project.id);
            this.renderProjects(this.getProjects(), containerId);
          }
        });
      }

      const duplicateBtn = card.querySelector(".duplicate-project-btn");
      if (duplicateBtn) {
        duplicateBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.duplicateProject(project.id);
          this.renderProjects(this.getProjects(), containerId);
        });
      }

      const exportBtn = card.querySelector(".export-project-btn");
      if (exportBtn) {
        exportBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.exportProject(project.id);
        });
      }

      container.appendChild(card);
    });
  }

  // Render templates grid
  renderTemplates(templates, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    const template = document.getElementById("project-card-template");
    if (!template) return;

    templates.forEach((templateData) => {
      const card = template.content.cloneNode(true);
      const cardElement = card.querySelector(".project-card");
      
      // Hide duplicate/delete/export buttons for templates
      const duplicateBtn = card.querySelector(".duplicate-project-btn");
      if (duplicateBtn) duplicateBtn.style.display = "none";
      const deleteBtn = card.querySelector(".delete-project-btn");
      if (deleteBtn) deleteBtn.style.display = "none";
      const exportBtn = card.querySelector(".export-project-btn");
      if (exportBtn) exportBtn.style.display = "none";
      
      // Set thumbnail
      const thumbnailImg = card.querySelector(".thumbnail-image");
      if (thumbnailImg) thumbnailImg.src = templateData.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Crect fill='%23f0f0f0' width='200' height='150'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ETemplate%3C/text%3E%3C/svg%3E";
      
      // Set title
      const title = card.querySelector(".project-card-title");
      if (title) title.textContent = templateData.name;
      
      // Set date
      const date = card.querySelector(".project-card-date");
      if (date) {
        const dateObj = new Date(templateData.createdAt);
        date.textContent = "Template • " + dateObj.toLocaleDateString();
      }
      
      // Set description
      const description = card.querySelector(".project-card-description");
      if (description) description.textContent = templateData.description || "Ready-to-use template";

      // Set up open button
      const openBtn = card.querySelector(".open-project-btn");
      if (openBtn) {
        openBtn.addEventListener("click", () => {
          this.loadProjectFromGallery(templateData.id).then(() => {
            const modal = bootstrap.Modal.getInstance(document.getElementById("projectGalleryModal"));
            if (modal) modal.hide();
          });
        });
      }

      container.appendChild(card);
    });
  }

  // Setup gallery modal
  setupGalleryModal() {
    const modal = document.getElementById("projectGalleryModal");
    if (!modal) return;

    modal.addEventListener("show.bs.modal", () => {
      this.renderProjects(this.getProjects(), "projects-grid");
      this.renderTemplates(this.getTemplates(), "templates-grid");
    });

    // Also refresh when switching tabs
    const projectsTab = document.getElementById("projects-tab");
    const templatesTab = document.getElementById("templates-tab");
    
    if (projectsTab) {
      projectsTab.addEventListener("shown.bs.tab", () => {
        this.renderProjects(this.getProjects(), "projects-grid");
      });
    }
    
    if (templatesTab) {
      templatesTab.addEventListener("shown.bs.tab", () => {
        this.renderTemplates(this.getTemplates(), "templates-grid");
      });
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // Open gallery button
    const openGalleryBtn = document.getElementById("open-gallery-btn");
    if (openGalleryBtn) {
      openGalleryBtn.addEventListener("click", () => {
        const modal = new bootstrap.Modal(document.getElementById("projectGalleryModal"));
        modal.show();
      });
    }

    // Save current project button
    const saveCurrentBtn = document.getElementById("save-current-project-btn");
    if (saveCurrentBtn) {
      saveCurrentBtn.addEventListener("click", async () => {
        const name = prompt("Enter project name:", `Project ${new Date().toLocaleDateString()}`);
        if (name) {
          const description = prompt("Enter project description (optional):", "");
          await this.saveProjectToGallery(name, description || "");
          this.renderProjects(this.getProjects(), "projects-grid");
        }
      });
    }

    // Search functionality
    const projectSearch = document.getElementById("project-search");
    if (projectSearch) {
      projectSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const projects = this.getProjects();
        const filtered = projects.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            (p.description && p.description.toLowerCase().includes(query))
        );
        this.renderProjects(filtered, "projects-grid");
      });
    }

    const templateSearch = document.getElementById("template-search");
    if (templateSearch) {
      templateSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const templates = this.getTemplates();
        const filtered = templates.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            (t.description && t.description.toLowerCase().includes(query))
        );
        this.renderTemplates(filtered, "templates-grid");
      });
    }

    // Save as template button
    const saveAsTemplateBtn = document.getElementById("save-as-template-btn");
    if (saveAsTemplateBtn) {
      saveAsTemplateBtn.addEventListener("click", async () => {
        const name = prompt("Enter template name:", `Template ${new Date().toLocaleDateString()}`);
        if (name) {
          const description = prompt("Enter template description (optional):", "");
          await this.saveAsTemplate(name, description || "");
          this.renderTemplates(this.getTemplates(), "templates-grid");
        }
      });
    }

    // Export all projects button
    const exportAllBtn = document.getElementById("export-all-projects-btn");
    if (exportAllBtn) {
      exportAllBtn.addEventListener("click", () => {
        this.exportAllProjects();
      });
    }

    // Import project button
    const importProjectBtn = document.getElementById("import-project-btn");
    const importProjectInput = document.getElementById("import-project-input");
    if (importProjectBtn && importProjectInput) {
      importProjectBtn.addEventListener("click", () => {
        importProjectInput.click();
      });
      importProjectInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            await this.importProject(file);
            this.renderProjects(this.getProjects(), "projects-grid");
          } catch (error) {
            console.error("Import failed:", error);
          }
          importProjectInput.value = "";
        }
      });
    }

    // Import backup button
    const importBackupBtn = document.getElementById("import-backup-btn");
    const importBackupInput = document.getElementById("import-backup-input");
    if (importBackupBtn && importBackupInput) {
      importBackupBtn.addEventListener("click", () => {
        importBackupInput.click();
      });
      importBackupInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            await this.importBackup(file);
            this.renderProjects(this.getProjects(), "projects-grid");
            this.renderTemplates(this.getTemplates(), "templates-grid");
          } catch (error) {
            console.error("Backup import failed:", error);
          }
          importBackupInput.value = "";
        }
      });
    }
  }

  // Load default templates
  loadDefaultTemplates() {
    const templates = this.getTemplates();
    if (templates.length > 0) return; // Templates already exist

    // Create a blank template
    const blankTemplate = {
      id: "template_blank",
      name: "Blank Template",
      description: "Start with a clean canvas",
      thumbnail: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Crect fill='%23ffffff' width='200' height='150'/%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3EBlank Template%3C/text%3E%3C/svg%3E",
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      data: {
        version: "4.0",
        timestamp: new Date().toISOString(),
        cameras: { cameraDevices: [], counters: { cameraCounter: 1, deviceCounter: 1 } },
        drawing: { drawingObjects: [], zones: [], rooms: [], walls: { circles: [], lines: [] }, titleblocks: [] },
        canvas: { version: "4.0", objects: [] },
        clientDetails: {},
        screenshots: [],
        topology: { connections: [], mapPositions: {} },
        settings: { pixelsPerMeter: 17.5, zoom: 1, viewportTransform: [1, 0, 0, 1, 0, 0] },
      },
    };

    templates.push(blankTemplate);
    localStorage.setItem(this.templatesKey, JSON.stringify(templates));
  }
}

export { ProjectManager };

