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

// Cloud masking function
var maskClouds = function (img) {
  var cloudProb = img.select('MSK_CLDPRB');
  var mask = cloudProb.lt(20);
  return img.updateMask(mask);
};

// Function to mask clouds using the Sentinel-2 cloud probability band
function maskCloudsUsingProbability(image) {
  // Select the cloud probability band
  var cloudProb = image.select('probability');

  // Create a mask using the specified probability threshold (adjust as needed)
  var mask = cloudProb.lt(20); // You can adjust the threshold (e.g., 20%) based on your preference

  // Update the image mask
  return image.updateMask(mask);
}

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

  // Load Harmonized Sentinel-2 ImageCollection for the selected region and date range
  var s2_image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')//_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .map(maskClouds) 
    .map(function (image) {
      return image.clip(aoi);
    });

  // Display the true-color Sentinel-2 image for the selected region
  var rgbParams = {
    bands: ['B4', 'B3', 'B2'],
    min: 0,
    max: 3000,
  };
  Map.addLayer(s2_image, rgbParams, 'S2 RGB', true);

  // Calculate NDVI and display on the map
  var ndviImage = s2_image.map(calculateNDVI);
  var ndviParams = {
    min: -1,
    max: 1,
    palette: ['red', 'white', 'green'],
  };
  Map.addLayer(ndviImage, ndviParams, 'Mean NDVI', true);
  
  // Map the cowpeas layer on top of all layers
  Map.addLayer(cowpeas_crop, {color: 'blue'}, 'Cowpeas', true);
  // Export RGB images clipped to each cowpeas plot
  // cowpeas_crop
  //   .map(function (feature) {
  //     var plotName = feature.get('your_plot_name_property'); // Change this to the actual property name
  //     var plotGeometry = feature.geometry();

  //     var plotImage = s2_image
  //       .mean()
  //       .clip(plotGeometry);

  //     Export.image.toDrive({
  //       image: plotImage.toInt(),
  //       description: 'RGB_' + plotName,
  //       scale: 10, // Adjust scale as needed
  //       region: plotGeometry,
  //       maxPixels: 1e13
  //     });
  //   });
}









// // Define region of interest
// var roi = adm_boundary_2.filter(ee.Filter.eq('NAME_2', 'Pikine'));
// var aoi = roi.geometry();

// // Set dates 
// var startDate = '2023-08-01';  
// var endDate = '2023-08-17';

// // Other parameters
// var cloudFilter = 100;   
// var cloudProbThresh = 100;
// var darkNirThresh = 0.15;  
// var projectionDistance = 1;  

// // Get and filter Sentinel 2 collections
// var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
//     .filterBounds(aoi)
//     .filterDate(startDate, endDate)
//     .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', cloudFilter));
    
// var s2Cloudless = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
//     .filterBounds(aoi)
//     .filterDate(startDate, endDate);

// // Function to add cloud and shadow bands
// var addCloudShadowBands = function(img) {

//   // Filter cloud probability collection for the specific date
//   var cloudProb = s2Cloudless
//     .filterDate(img.date(), img.date().advance(1, 'day'))
//     .first();

//   // If no cloud probability information is available, set a default value
//   cloudProb = ee.Image(ee.Algorithms.If(cloudProb, cloudProb.select('probability'), ee.Image.constant(0)));

//   // Cloud mask
//   var clouds = cloudProb.gt(cloudProbThresh); 

//   // Identify non-water pixels
//   var notWater = img.select('SCL').neq(6);

//   // Calculate shadows
//   var projection = clouds  
//     .directionalDistanceTransform(0, projectionDistance)
//     .reproject(img.select(0).projection(), null, 100);

//   // Identify shadows    
//   var shadows = projection.multiply(img.select('B8').lt(darkNirThresh * 1e4).multiply(notWater)).rename('shadows');

//   // Add cloud and shadow bands 
//   return img.addBands(cloudProb.rename('cloudProbability'))
//             .addBands(clouds.rename('cloudMask'))
//             .addBands(shadows);
// };

// // Apply masking to the collection
// var maskedCol = s2.map(addCloudShadowBands);

// // Print or display results
// print(maskedCol);



// // Define region of interest
// var aoi = null; // Initialized as null
// var cowpeas = ee.FeatureColelction(cowpeas_sen);
// // Get all NAME_2 properties
// var nameProperties = adm_boundary_4.aggregate_array('NAME_2');

// // Get unique values
// var uniqueNames = ee.List(nameProperties).distinct().getInfo();
// print(uniqueNames);

// // Populate dropdown
// var roiSelect = ui.Select({
//   items: uniqueNames,
//   onChange: handleSelectChange
// });

// function handleSelectChange(selected) {
//   var selectedName = selected;

//   // Update region of interest (aoi) based on the selected dropdown value
//   aoi = adm_boundary_4
//     .filter(ee.Filter.equals('NAME_2', selectedName))
//     .geometry();

//   // Center the map on the updated region of interest
//   Map.centerObject(aoi, 10);

//   // Clear existing layers
//   Map.layers().reset();

//   // Redraw layers for the updated region of interest
//   Map.addLayer(aoi, { color: 'white' }, 'Selected Region', false);

//   // Cloud masking function
//   var maskClouds = function (img) {
//     var cloudProb = img.select('MSK_CLDPRB');
//     var mask = cloudProb.lt(10);
//     return img.updateMask(mask);
//   };

//   // Function to calculate NDVI
//   function calculateNDVI(image) {
//     var nir = image.select('B8');
//     var red = image.select('B4');
//     var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
//     return ndvi;
//   }
//   var startDate ='2023-08-01';
//   var endDate = '2023-11-01';
//   // Function to update layers based on region and date changes
//   function redrawLayers() {
//     if (!aoi || !startDate || !endDate) {
//       return;
//     }

//   // Load Harmonized Sentinel-2 ImageCollection for the selected region and date range
//   var s2_image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
//     .filterBounds(aoi)
//     .filterDate(startDate, endDate)
//     .map(maskClouds)
//     .map(function (image) {
//       return image.clip(aoi);
//     });

//   // Display the true-color Sentinel-2 image for the selected region
//   var rgbParams = {
//     bands: ['B4', 'B3', 'B2'],
//     min: 0,
//     max: 3000,
//   };
//   Map.addLayer(s2_image, rgbParams, 'S2 RGB', true);

//   // Calculate NDVI and display on the map
//   var ndviImage = s2_image.map(calculateNDVI);
//   var ndviParams = {
//     min: -1,
//     max: 1,
//     palette: ['red', 'white', 'green'],
//   };
//   Map.addLayer(ndviImage, ndviParams, 'Mean NDVI', true);
//   }

//   // Call the redrawLayers function to initialize the map
//   redrawLayers();


//   // Set the desired cloud cover threshold
//   var maxCloudCover = 10;

//   // Filter Landsat 8 images based on location, date, and cloud cover for the selected region
// var imageL8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_TOA')
//     .filterBounds(aoi)
//     .filterDate('2023-08-01', '2023-11-01')
//     .filterMetadata('CLOUD_COVER', 'less_than', maxCloudCover)
//     .sort('CLOUD_COVER')
//     .first()
//     // Set scale and crs 
//     .reproject({
//       crs: 'EPSG:32721',
//       scale: 30 
//     })
//     .clip(aoi);

//   // Specify which bands to use for the unmixing.
//   var unmixImage = imageL8.select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7']);

//   // Use a false color composite to help define polygons of 'pure' land cover.
//   Map.addLayer(imageL8, {
//     bands: ['B5', 'B4', 'B3'],
//     min: 0.0,
//     max: 0.4
//   }, 'False Color Landsat 8 Image', true);

//   // Convert Landsat 8 RGB bands to HSV color space
//   var hsv = imageL8.select(['B4', 'B3', 'B2']).rgbToHsv();

//   Map.addLayer(hsv, {
//     max: 0.4
//   }, 'HSV Transform', true);

//   // Convert back to RGB, swapping the image panchromatic band for the value.
//   var rgb = ee.Image.cat([
//     hsv.select('hue'),
//     hsv.select('saturation'),
//     imageL8.select(['B8'])
//   ]).hsvToRgb();

//   Map.addLayer(rgb, {
//     max: 0.4
//   }, 'Pan-sharpened', true);
// }

// // Add widget to map
// ui.root.add(roiSelect);


// // // Define region of interest
// // //var roi = adm_boundary_4.filter(ee.Filter.eq('NAME_2', 'Pikine'));
// // var aoi = adm_boundary_4.geometry();

// // // Center the map on the region of interest
// // Map.centerObject(aoi, 10);
// // // Display geometry outline
// // Map.addLayer(aoi, { color: 'white' }, 'Senegal', false);


// // // Get all NAME_2 properties 
// // var nameProperties = adm_boundary_4.aggregate_array('NAME_2');

// // // Get unique values
// // var uniqueNames = ee.List(nameProperties).distinct().getInfo(); 
// // print(uniqueNames);
// // // Populate dropdown
// // // Populate dropdown  
// // var roiSelect = ui.Select({
// //   items: uniqueNames,
// //   onChange: handleSelectChange
// // });

// // function handleSelectChange(selected) {

// //   var selectedName = selected;
  
// //   var roi = adm_boundary_4
// //     .filter(ee.Filter.equals('NAME_2', selectedName));

// //   // update aoi, redraw layers
// // }

// // // Add widget to map
// // ui.root.add(roiSelect);




// // // Cloud masking function
// // var maskClouds = function (img) {
// //   var cloudProb = img.select('MSK_CLDPRB');
// //   var mask = cloudProb.lt(10);
// //   return img.updateMask(mask);
// // };

// // // Load Harmonized Sentinel-2 ImageCollection
// // var s2_image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
// //   .filterBounds(aoi)
// //   .filterDate('2023-08-01', '2023-10-01')
// //   .map(maskClouds);
// //   //.first();

// // // Display the true-color Sentinel-2 image
// // var rgbParams = {
// //   bands: ['B4', 'B3', 'B2'],
// //   min: 0,
// //   max: 3000,
// // };

// // Map.addLayer(s2_image, rgbParams, 'S2 RGB', false);
// // print(s2_image);

// // // Load regular Sentinel-2 ImageCollection
// // var s2_collection = ee.ImageCollection('COPERNICUS/S2_SR')
// //   .filterBounds(aoi)
// //   .filterDate('2023-08-01', '2023-10-30')
// //   .map(maskClouds);

// // // Define visualization parameters
// // var s2_rgb_viz = {
// //   bands: ['B4', 'B3', 'B2'],
// //   min: 0,
// //   max: 3000,
// // };

// // // Convert images to RGB and add to the map
// // var s2_rgb = s2_collection.map(function (image) {
// //   return image.select(['B4', 'B3', 'B2']).clip(aoi);
// // });

// // Map.addLayer(s2_rgb, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 'Sentinel-2 RGB',false);

// // // Load polygon asset  
// // var cowpeas = ee.FeatureCollection(cowpeas_sen);
// // // Define visualization parameters
// // var polygonStyle = {
// //   fillColor: false,
// //   color: 'blue', 
// //   width: 2
// // };

// // // Display the polygon
// // Map.addLayer(cowpeas, polygonStyle, 'Mixed cowpeas plots');

// // // Calculate EVI using Sentinel 2

// // // Extract the bands and divide by 10,000 to account for scaling done.
// // var nirScaled = s2_image.select('B8').divide(10000);
// // var redScaled = s2_image.select('B4').divide(10000);
// // var blueScaled = s2_image.select('B2').divide(10000);

// // // Calculate the numerator, note that order goes from left to right.
// // var numeratorEVI = (nirScaled.subtract(redScaled)).multiply(2.5);

// // // Calculate the denominator.
// // var denomClause1 = redScaled.multiply(6);
// // var denomClause2 = blueScaled.multiply(7.5);
// // var denominatorEVI = nirScaled.add(denomClause1)
// //     .subtract(denomClause2).add(1);

// // // Calculate EVI and name it.
// // var EVI = numeratorEVI.divide(denominatorEVI).rename('EVI');

// // // And now map EVI using our vegetation palette.
// // var vegPalette = ['red', 'white', 'green'];
// // var visParams = {min: -1, max: 1, palette: vegPalette};
// // Map.addLayer(EVI, visParams, 'EVI',false);

// // // Calculate EVI.
// // var eviExpression = s2_image.expression({
// //     expression: '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
// //     map: { // Map between variables in the expression and images.
// //         'NIR': s2_image.select('B8').divide(10000),
// //         'RED': s2_image.select('B4').divide(10000),
// //         'BLUE': s2_image.select('B2').divide(10000)
// //     }
// // });


// // // And now map EVI using our vegetation palette.
// // Map.addLayer(eviExpression, visParams, 'EVI Expression',false);

// // // Calculate EVI from Sentinel-2
// // var nir = s2_image.select('B8').divide(10000);
// // var red = s2_image.select('B4').divide(10000); 
// // var blue = s2_image.select('B2').divide(10000);

// // var nirMinusRed = nir.subtract(red);
// // var numerator = nirMinusRed.multiply(2.5); 

// // var redMultiplied = red.multiply(6);
// // var blueMultiplied = blue.multiply(7.5);

// // var denominator = nir.add(redMultiplied)
// //                   .subtract(blueMultiplied)
// //                   .add(1);
                   
// // var evi = numerator.divide(denominator).rename('EVI');

// // var visParams = {
// //   min: 0, 
// //   max: 1,
// //   palette: ['green','yellow','red'] 
// // };

// // Map.addLayer(evi, visParams, 'EVI2');
// // // Set the desired cloud cover threshold
// // var maxCloudCover = 10;  // You can adjust this value according to your preference

// // // Filter Landsat 8 images based on location, date, and cloud cover
// // var imageL8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_TOA')
// //     .filterBounds(aoi)
// //     .filterDate('2023-08-01', '2023-11-01')
// //     .filterMetadata('CLOUD_COVER', 'less_than', maxCloudCover)
// //     .sort('CLOUD_COVER');

// // // Display the true-color Landsat 8 images
// // var rgbParams = {
// //     bands: ['B4', 'B3', 'B2'],
// //     min: 0,
// //     max: 0.3
// // };

// // Map.addLayer(imageL8, rgbParams, 'True-Color Landsat 8 Image', false);

// // // //  -----------------------------------------------------------------------
// // // Map.addLayer(imageL8, trueColorL8, 'L8 true color',false);
// // var maxCloudCover = 10;  // You can adjust this value according to your preference

// // // Filter Landsat 8 images based on location, date, and cloud cover
// // var imageL8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_TOA')
// //     .filterBounds(aoi)
// //     .filterDate('2023-08-01', '2023-11-01')
// //     .filterMetadata('CLOUD_COVER', 'less_than', maxCloudCover)
// //     .sort('CLOUD_COVER')
// //     .first();

// // // Specify which bands to use for the unmixing.
// // var unmixImage = imageL8.select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7']);

// // // Use a false color composite to help define polygons of 'pure' land cover.
// // Map.addLayer(imageL8, {
// //     bands: ['B5', 'B4', 'B3'],
// //     min: 0.0,
// //     max: 0.4
// // }, 'false color',false);


// // // Begin HSV transformation example
// // //the hue, saturation, and value (HSV) transform is a color transform of the RGB color space
// // // Convert Landsat 8 RGB bands to HSV color space
// // var hsv = imageL8.select(['B4', 'B3', 'B2']).rgbToHsv();

// // Map.addLayer(hsv, {
// //     max: 0.4
// // }, 'HSV Transform',false);

// // // Convert back to RGB, swapping the image panchromatic band for the value.
// // var rgb = ee.Image.cat([
// //     hsv.select('hue'),
// //     hsv.select('saturation'),
// //     imageL8.select(['B8'])
// // ]).hsvToRgb();

// // Map.addLayer(rgb, {
// //     max: 0.4
// // }, 'Pan-sharpened',false);

