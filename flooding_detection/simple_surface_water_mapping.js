
function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000);
}

var dataset = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                  .filterDate('2023-01-01', '2023-03-31')
                  .filterBounds(dagana)
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
                  .map(maskS2clouds);

print(dataset, 'dataset');               
var image = dataset.mosaic().clip(dagana);
print(image, 'image_mosaic'); 
var visualization = {
  min: 0,
  max: 0.3,
  bands: ['B4', 'B3', 'B2'],
};
// get date of image
// print("Sentinel image taken at = ", image.date());

// add layer to map
Map.centerObject(dagana, 10);
Map.addLayer(image, visualization, 'RGB');

// compute NDWI/MNDWI
// var ndwi_nir = image.normalizedDifference(['B3', 'B8']).rename('NDWI') // (Green - NIR / Green + NIR)
var ndwi_swir = image.normalizedDifference(['B3', 'B12']).rename('NDWI SWIR'); // (Green - SWIR / Green + SWIR)
var mndwi = image.normalizedDifference(['B3', 'B11']).rename('MNDWI');

// add layer to map
Map.addLayer(ndwi_swir, {palette: ['red', 'yellow', 'green', 'cyan', 'blue']}, 'NDWI');
Map.addLayer(mndwi, {palette: ['red', 'yellow', 'green', 'cyan', 'blue']}, 'MNDWI');

// Create NDWI mask
var ndwiThreshold = ndwi_swir.gte(0.4);
var ndwiMask = ndwiThreshold.updateMask(ndwiThreshold);
Map.addLayer(ndwiThreshold, {palette:['black', 'white']}, 'NDWI Binary Mask');
Map.addLayer(ndwiMask, {palette:['blue']}, 'NDWI Mask');

// Create NDWI mask
var mndwiThreshold = mndwi.gte(0);
var mndwiMask = mndwiThreshold.updateMask(mndwiThreshold);
Map.addLayer(mndwiThreshold, {palette:['black', 'white']}, 'MNDWI Binary Mask');
Map.addLayer(mndwiMask, {palette:['blue']}, 'MNDWI Mask');

   
// Get permanent water from JRC dataset
var swater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality');
var swater_mask = swater.gte(2).updateMask(swater.gte(2));

// Create flooded layer for both NDWI and MNDWI
var ndwi_flooded_mask = mndwiMask.where(swater_mask, 0);
var ndwi_flooded = ndwi_flooded_mask.updateMask(ndwi_flooded_mask);

var mndwi_flooded_mask = mndwiMask.where(swater_mask, 0);
var mndwi_flooded = mndwi_flooded_mask.updateMask(mndwi_flooded_mask);

// Compute connectivity and apply to both NDWI and MNDWI
var ndwi_connections = ndwi_flooded.connectedPixelCount();
ndwi_flooded = ndwi_flooded.updateMask(ndwi_connections.gte(8));

var mndwi_connections = mndwi_flooded.connectedPixelCount();
mndwi_flooded = mndwi_flooded.updateMask(mndwi_connections.gte(8));

// Mask out areas with more than 5 percent slope
var DEM = ee.Image('WWF/HydroSHEDS/03VFDEM');
var terrain = ee.Algorithms.Terrain(DEM);
var slope = terrain.select('slope');

ndwi_flooded = ndwi_flooded.updateMask(slope.lt(5));
mndwi_flooded = mndwi_flooded.updateMask(slope.lt(5));

// Add flooded layers to map
Map.addLayer(ndwi_flooded, {palette: ['blue']}, 'NDWI Flooded Areas');
Map.addLayer(mndwi_flooded, {palette: ['red']}, 'MNDWI Flooded Areas');

// Calculate flood extent area
// Create a raster layer containing the area information of each pixel 
var flood_pixelarea = mndwi_flooded.multiply(ee.Image.pixelArea());

// Sum the areas of flooded pixels
// default is set to 'bestEffort: true' in order to reduce compuation time, for a more 
// accurate result set bestEffort to false and increase 'maxPixels'. 
var flood_stats = flood_pixelarea.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: dagana,
  scale: 10, // native resolution 
  maxPixels: 1e13,
  bestEffort: true
  });
// print(flood_stats) // 39179456.81496498m2

// Convert the flood extent to hectares (area calculations are originally given in meters)  
var flood_area_ha = flood_stats.getNumber('NDWI SWIR').divide(10000).round(); 

// print(flood_area_ha) // 3918 ha


