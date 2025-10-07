// VisualizationManager - Handles OBB and contact point visualization
import * as THREE from 'three';
import { 
  createOBBVisualization, 
  updateOBBVisualization,
  createContactVisualization,
  updateContactPoints,
  updateGeomMeanMarker 
} from '../visualization.js';

export class VisualizationManager {
  constructor(scene, CFG) {
    this.scene = scene;
    this.CFG = CFG;
    
    this.obbGroup = null;
    this.contactPointsGroup = null;
    this.geomMeanMarker = null;
    
    this.showOBB = false;
    this.showContacts = false;
    this.showGeomCenter = false;
  }

  // Initialize visualization objects
  init() {
    this.createOBBVisualization();
    this.createContactVisualization();
    
    return {
      obbGroup: this.obbGroup,
      contactPointsGroup: this.contactPointsGroup,
      geomMeanMarker: this.geomMeanMarker
    };
  }

  createOBBVisualization() {
    const { obbGroup } = createOBBVisualization(THREE, this.scene);
    this.obbGroup = obbGroup;
  }

  createContactVisualization() {
    const { contactPointsGroup, geomMeanMarker } = createContactVisualization(THREE, this.CFG);
    this.contactPointsGroup = contactPointsGroup;
    this.geomMeanMarker = geomMeanMarker;
    this.scene.add(this.contactPointsGroup);
    this.scene.add(this.geomMeanMarker);
  }

  // Update OBB visualization
  updateOBB(obb, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, paddingDepthBottomScale) {
    if (obb && this.obbGroup) {
      updateOBBVisualization(
        this.obbGroup, 
        obb, 
        paddingWidthScale, 
        paddingHeightScale, 
        paddingDepthTopScale, 
        paddingDepthBottomScale, 
        this.CFG, 
        THREE
      );
      this.obbGroup.visible = this.showOBB;
    } else if (this.obbGroup) {
      this.obbGroup.visible = false;
    }
  }

  // Update contact points visualization
  updateContacts(contactSamples, showContacts) {
    if (this.contactPointsGroup) {
      updateContactPoints(this.contactPointsGroup, contactSamples, showContacts, this.CFG, THREE);
    }
  }

  // Update geometric center marker
  updateGeomCenter(geometricCenter, showGeomCenter) {
    if (this.geomMeanMarker) {
      updateGeomMeanMarker(this.geomMeanMarker, geometricCenter, showGeomCenter);
    }
  }

  // Toggle OBB visibility
  toggleOBB(show) {
    this.showOBB = show;
    if (this.obbGroup) {
      this.obbGroup.visible = show;
    }
  }

  // Toggle contact points visibility
  toggleContacts(show) {
    this.showContacts = show;
  }

  // Toggle geometric center visibility
  toggleGeomCenter(show) {
    this.showGeomCenter = show;
  }

  // Get OBB group reference
  getOBBGroup() {
    return this.obbGroup;
  }

  // Get contact points group reference
  getContactPointsGroup() {
    return this.contactPointsGroup;
  }

  // Get geometric mean marker reference
  getGeomMeanMarker() {
    return this.geomMeanMarker;
  }

  // Get visibility states
  getVisibilityStates() {
    return {
      showOBB: this.showOBB,
      showContacts: this.showContacts,
      showGeomCenter: this.showGeomCenter
    };
  }

  // Cleanup method
  dispose() {
    if (this.obbGroup) {
      this.scene.remove(this.obbGroup);
      this.obbGroup = null;
    }
    
    if (this.contactPointsGroup) {
      this.scene.remove(this.contactPointsGroup);
      this.contactPointsGroup = null;
    }
    
    if (this.geomMeanMarker) {
      this.scene.remove(this.geomMeanMarker);
      this.geomMeanMarker = null;
    }
  }
}
