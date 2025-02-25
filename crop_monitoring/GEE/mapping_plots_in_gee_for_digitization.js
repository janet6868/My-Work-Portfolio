//checking the number of nicfi images available in senegal
var sen = nicfi_africa.filterBounds(adm_boundary_1);
//we have 50 images from 2015 to 2024 JAN
print(sen);

// Replace 'your_geometry' with the variable containing your drawn polygons
var milletFeatures = ee.FeatureCollection(millet_v3);
print(milletFeatures);

// Export the polygon feature to Google Drive
Export.table.toDrive({
  collection:milletFeatures ,
  description: 'Drawn_Polygon',
  fileFormat: 'KML',  // You can change the file format to GeoJSON or other formats
});

// Define region of interest
var aoi = null; // Initialized as null
var startDate = '2023-08-01';
var endDate = '2023-12-31';

// Get all NAME_2 properties
var nameProperties = adm_boundary_2.aggregate_array('NAME_1');
//var nameProperties = ferlo.aggregate_array('CLASSE');
// Get unique values
var uniqueNames = ee.List(nameProperties).distinct().getInfo();
print(uniqueNames);

// Populate dropdown
var roiSelect = ui.Select({
  items: uniqueNames,
  onChange: handleSelectChange
});


// Date inputs
var startDateInput = ui.Textbox('Start Date', startDate);
var endDateInput = ui.Textbox('End Date', endDate);

var CLOUD_FILTER = 10;
var CLD_PRB_THRESH = 30;
var NIR_DRK_THRESH = 0.15;
var CLD_PRJ_DIST = 1;
var BUFFER = 0;

// Add widgets to map
ui.root.add(roiSelect);
ui.root.add(startDateInput);
ui.root.add(endDateInput);

var vis = { "bands": ["R", "G", "B"], "min": 64, "max": 5454, "gamma": 1.8 };
function getNicfiBasemap(startDate, endDate) {
    var nicfi = ee.ImageCollection('projects/planet-nicfi/assets/basemaps/africa');
    return nicfi.filter(ee.Filter.date(startDate, endDate)).first();
}

function displayNicfiBasemap(basemap, visParams) {
    Map.addLayer(basemap, visParams, 'Nicfi Basemap');
}

// Function to handle region select change
function handleSelectChange(selected) {
  var selectedName = selected;

  // Update region of interest (aoi) based on the selected dropdown value
  aoi = adm_boundary_2
    .filter(ee.Filter.equals('NAME_1', selectedName))
    .geometry();

  // Center the map on the updated region of interest
  Map.centerObject(aoi, 10);

  // Clear existing layers
  Map.layers().reset();

  // Redraw layers for the updated region of interest
  Map.addLayer(aoi, { color: 'white' }, 'Selected Region', false);

  // Call the redrawLayers function to initialize the map
  redrawLayers();
  }

  // Function to handle date changes
  function handleDateChange() {
    // Get the values from the text input widgets
    startDate = startDateInput.getValue();
    endDate = endDateInput.getValue();
  
    // Call the redrawLayers function to update layers based on date changes
    redrawLayers();
  }
  
  // Add event listener for date input changes
  startDateInput.onChange(handleDateChange);
  endDateInput.onChange(handleDateChange);
  
  // Function to calculate NDVI
  function calculateNDVI(image) {
    var nir = image.select('B8');
    var red = image.select('B4');
    var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
    return ndvi;
  }

// Function to update layers based on region and date changes
function redrawLayers() {
  if (!aoi || !startDate || !endDate) {
    return;
  }
  
  var basemap = getNicfiBasemap(startDate, endDate);
    displayNicfiBasemap(basemap, vis);
  
  
  function get_s2_sr_cld_col(aoi, start_date, end_date) {
      var s2_sr_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(aoi)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', CLOUD_FILTER))
        .map(function (image) {
        return image.clip(aoi);
      });
    
      var s2_cloudless_col = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
        .filterBounds(aoi)
        .filterDate(start_date, end_date);
    
      return ee.ImageCollection(ee.Join.saveFirst('s2cloudless').apply({
          'primary': s2_sr_col,
          'secondary': s2_cloudless_col,
          'condition': ee.Filter.equals({
            'leftField': 'system:index',
            'rightField': 'system:index'
          })
        }));
    }
  
  var s2_sr_cld_col_eval = get_s2_sr_cld_col(aoi, startDate, endDate);
  
  function add_cloud_bands(img) {
    var cld_prb = ee.Image(img.get('s2cloudless')).select('probability');
    var is_cloud = cld_prb.gt(CLD_PRB_THRESH).rename('clouds');
    return img.addBands(ee.Image([cld_prb, is_cloud]));
  }
  
  function add_shadow_bands(img) {
    var not_water = img.select('SCL').neq(6);
    var SR_BAND_SCALE = 1e4;
    var dark_pixels = img.select('B8').lt(NIR_DRK_THRESH * SR_BAND_SCALE).multiply(not_water).rename('dark_pixels');
    var shadow_azimuth = ee.Number(90).subtract(ee.Number(img.get('MEAN_SOLAR_AZIMUTH_ANGLE')));
    var cld_proj = img.select('clouds').directionalDistanceTransform(shadow_azimuth, CLD_PRJ_DIST * 10)
      .reproject({
        'crs': img.select(0).projection(),
        'scale': 100
      })
      .select('distance')
      .mask()
      .rename('cloud_transform');
    var shadows = cld_proj.multiply(dark_pixels).rename('shadows');
    return img.addBands(ee.Image([dark_pixels, cld_proj, shadows]));
  }
  
  function add_cld_shdw_mask(img) {
    var img_cloud = add_cloud_bands(img);
    var img_cloud_shadow = add_shadow_bands(img_cloud);
    var is_cld_shdw = img_cloud_shadow.select('clouds').add(img_cloud_shadow.select('shadows')).gt(0);
    is_cld_shdw = is_cld_shdw.focalMin(2).focalMax(BUFFER * 2 / 20)
      .reproject({
        'crs': img.select([0]).projection(),
        'scale': 20
      })
      .rename('cloudmask');
    return img_cloud_shadow.addBands(is_cld_shdw);
  }
  
  function apply_cld_shdw_mask(img) {
    var not_cld_shdw = img.select('cloudmask').not();
    return img.select('B.*').updateMask(not_cld_shdw);
  }
  
  var s2_sr_cld_col_eval_disp = s2_sr_cld_col_eval.map(add_cld_shdw_mask);
  
  function display_cloud_layers(col) {
    var img = col.mosaic();
    Map.addLayer(img, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 }, 'S2 image',false);
    Map.addLayer(img, {min: 0, max: 3000 }, 'image',false);
    Map.addLayer(img.normalizedDifference(['B8', 'B4']).rename('ndvi'), { min: 0,max: 1, palette: ['white', 'green']}, 'ndvi',false);
   // Map.addLayer(img.select('probability'), {min: 0, max: 100}, 'probability (cloud)',false);
    //Map.addLayer(img.select('clouds'), {palette: 'e056fd'}, 'clouds',false);
    //Map.addLayer(img.select('cloud_transform'), {min: 0, max: 1, palette: ['white', 'black']}, 'cloud_transform');
    //Map.addLayer(img.select('dark_pixels'), {palette: 'orange'}, 'dark_pixels',false);
    //Map.addLayer(img.select('shadows'), {palette: 'yellow'}, 'shadows',false);
   // Map.addLayer(img.select('cloudmask'), {palette: 'orange'}, 'cloudmask',false);
  }
  
  display_cloud_layers(s2_sr_cld_col_eval_disp);
  
  // Map the cowpeas layer on top of all layers
  Map.addLayer(cowpeas_crop, {color: 'blue'}, 'Cowpeas', false);
  Map.addLayer(cowpeas_points, {color: 'yellow'}, 'Cowpeas_points', false);
  Map.addLayer(millet_points, {color: 'purple'}, 'millet_points', false);
}

