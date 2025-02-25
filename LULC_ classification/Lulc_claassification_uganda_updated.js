
// Load the Ghana feature collection
var karamoja_aoi = ee.FeatureCollection('projects/ee-janet/assets/Uganda/karamoja');
var aoi = karamoja_aoi.geometry();
var point = ee.Geometry.Point([	34.663752,	2.556330]);
var point2 = ee.Geometry.Point([34.845722, 2.405936 ]);
Map.setCenter(	34.663752,	2.556330, 12);
// // Apply the buffer method to the point object.

var bufferDistance = 5000;
var pointBuffer = point.buffer(bufferDistance);
var pointBuffer2 = point2.buffer(100);

// Print the result to the console.
print('polygon.buffer(...) =', pointBuffer);
// Display relevant geometries on the map.

Map.addLayer(point, {'color': 'black', 'opacity': 1, 'fillOpacity': 0}, 'Geometry [black]: polygon',false);
Map.addLayer(pointBuffer, {'color': 'red', 'opacity': 1.0, 'fillOpacity': 0}, 'Result [red]: polygon.buffer', false);
Map.addLayer(point2, {'color': 'black', 'opacity': 1, 'fillOpacity': 0}, 'Geometry [black]: polygon',false);
Map.addLayer(pointBuffer2, {'color': 'red', 'opacity': 1.0, 'fillOpacity': 0}, 'Result [red]: polygon.buffer', false);
Map.addLayer(aoi, {'color': 'white', 'opacity': 1.0, 'fillOpacity': 0}, 'AOI', false);

var aoiArea = aoi.area();
var bufferarea = pointBuffer.area();

// We can cast the result to a ee.Number() and calculate the
// area in square kilometers
var aoiAreaSqKm = ee.Number(aoiArea).divide(1e6).round();
print('Total AOI Area(sqkm)', aoiAreaSqKm);


// &&&&&&&&&&&&&&&&&  

// Define study time period for nicfi and landsat
var start_date = '2014-11-01';
var end_date = '2015-03-31';


//&&&&&&&&&&&&&&&&&&&&  LANDSAT 7& * DATA &&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&

// Define a function that scales and masks Landsat 8 surface reflectance images.
function prepSrL8(image) {
  // Develop masks for unwanted pixels (fill, cloud, cloud shadow).
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Apply the scaling factors to the appropriate bands.
  var getFactorImg = function(factorNames) {
    var factorList = image.toDictionary().select(factorNames).values();
    return ee.Image.constant(factorList);
  };
  var scaleImg = getFactorImg([
    'REFLECTANCE_MULT_BAND_.|TEMPERATURE_MULT_BAND_ST_B10']);
  var offsetImg = getFactorImg([
    'REFLECTANCE_ADD_BAND_.|TEMPERATURE_ADD_BAND_ST_B10']);
  var scaled = image.select('SR_B.|ST_B10').multiply(scaleImg).add(offsetImg);

  // Replace original bands with scaled bands and apply masks.
  return image.addBands(scaled, null, true)
    .updateMask(qaMask).updateMask(saturationMask);
}

// Function for adding remote sensing indices
function addVIs(img) {
  // Calculate NDVI
  var ndvi = img.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');

  // Calculate NDWI
  var ndwi = img.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI');

  // Calculate NDBI-normalized difference built-up area index
  var ndbi = img.normalizedDifference(['SR_B6', 'SR_B5']).rename('NDBI');

  // Calculate NBR
  var nbr = img.normalizedDifference(['SR_B5', 'SR_B7']).rename('NBR');

  // Calculate NDMI
  var ndmi = img.normalizedDifference(['SR_B5', 'SR_B6']).rename('NDMI');

  // Calculate SAVI
  var savi = img.expression(
    '((nir - red) / (nir + red + 0.5)) * (1 + 0.5)',
    {
      nir: img.select('SR_B5'),
      red: img.select('SR_B4')
    }
  ).rename('SAVI');
  
   // Calculate urban index
  var ui = img.expression(
    '((swir2 - nir) / (swir2 + nir )) +1',
    {
      nir: img.select('SR_B5'),
      swir2: img.select('SR_B7')
    }
  ).rename('UI');

  // Calculate TCB, TCG, and TCW using the Tasseled Cap Transformation
  //tasseled coefficients for greeness, brightness and wetness
  var tcb = img.expression(
    '0.3037 * B2 + 0.2793 * B3 + 0.4743 * B4 + 0.5585 * B5 + 0.5082 * B6 + 0.1863 * B7',
    {
      B2: img.select('SR_B2'),
      B3: img.select('SR_B3'),
      B4: img.select('SR_B4'),
      B5: img.select('SR_B5'),
      B6: img.select('SR_B6'),
      B7: img.select('SR_B7')
    }
  ).rename('TCB');

  var tcg = img.expression(
    '-0.2941 * B2 - 0.243 * B3 - 0.5436 * B4 + 0.7243 * B5 + 0.084 * B6 - 0.180 * B7',
    {
      B2: img.select('SR_B2'),
      B3: img.select('SR_B3'),
      B4: img.select('SR_B4'),
      B5: img.select('SR_B5'),
      B6: img.select('SR_B6'),
      B7: img.select('SR_B7')
    }
  ).rename('TCG');

  var tcw = img.expression(
    '0.1511 * B2 + 0.1973 * B3 + 0.3283 * B4 + 0.3407 * B5 - 0.7117 * B6 - 0.4559 * B7',
    {
      B2: img.select('SR_B2'),
      B3: img.select('SR_B3'),
      B4: img.select('SR_B4'),
      B5: img.select('SR_B5'),
      B6: img.select('SR_B6'),
      B7: img.select('SR_B7')
    }
  ).rename('TCW');

  // Calculate TCA
  var tca = img.expression(
    '0.2043 * B2 + 0.4158 * B3 + 0.5524 * B4 + 0.5741 * B5 + 0.3124 * B6 + 0.2303 * B7',
    {
      B2: img.select('SR_B2'),
      B3: img.select('SR_B3'),
      B4: img.select('SR_B4'),
      B5: img.select('SR_B5'),
      B6: img.select('SR_B6'),
      B7: img.select('SR_B7')
    }
  ).rename('TCA');

  // Combine the original image with calculated indices
  return img.addBands([ndvi, ndwi, ndbi, nbr, ndmi, savi,ui, tcb, tcg, tcw, tca]);
}



// Make a cloud-free Landsat 8 surface reflectance composite.
var L7_image = ee.ImageCollection('LANDSAT/LC07/C02/T1_L2')
  .filterDate('2015-01-01', '2015-12-31')
  .map(prepSrL8)
  .map(addVIs)
  .median()
  .clip(pointBuffer);
  
// Make a cloud-free Landsat 8 surface reflectance composite.
var L8_image = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterDate('2014-11-01', '2015-03-31')
  .map(prepSrL8)
  .map(addVIs)
  .median()
  .clip(aoi);

print('l8_image_composite:', L8_image);

// Add remote sensing indices to the Landsat image

// Calculate median and maximum values for each index
var medianAndMax = L8_image.reduceRegion({
  reducer: ee.Reducer.median().combine({
    reducer2: ee.Reducer.max(),
    sharedInputs: true
  }),
  geometry: pointBuffer,
  scale: 30,
  bestEffort: true,
  maxPixels: 1e13
});

//print(medianAndMax);

// Make a "greenest" pixel composite.
//var greenest = L8_image.select('NDVI').median();

// Display the result.
var visParams = {bands: [ 'SR_B4', 'SR_B3', 'SR_B2'], max: 0.3};
Map.addLayer(L8_image,{bands:['NDVI']}, 'Greenest pixel composite',false);


// Use these bands for prediction.
var bands = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5',
             'SR_B6', 'SR_B7'];
// Add the RGB visualization to the map
Map.addLayer(L8_image,
             {bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.25},
             'Landsat8_2015');
    
var l18_3 =L8_image;//imageWithMedianAndMax;

 /// &&&&&&&&&&&&&   Unsupervised classification &&&&&&&&&&&&&&&&&&&&&
 // Unsupervised k-Means classification -the study area in a true-color view

var afn_Kmeans = function(input, numberOfUnsupervisedClusters,  //can use xmeans or kmeans
    defaultStudyArea, nativeScaleOfImage) {

    // Make a new sample set on the input. Here the sample set is 
    // randomly selected spatially. 
    var training = input.sample({
        region: defaultStudyArea,
        scale: nativeScaleOfImage,
        numPixels: 100000
    });

    var cluster = ee.Clusterer.wekaXMeans(
            numberOfUnsupervisedClusters)
        .train(training);

    // Now apply that clusterer to the raw image that was also passed in. 
    var toexport = input.cluster(cluster);

    // The first item is the unsupervised classification. Name the band.
    var clusterUnsup = toexport.select(0).rename(
        'unsupervisedClass');
    return (clusterUnsup);
};

// Simple normalization by maxes function.
//normalize the band values to a common scale from 0 to 1
var afn_normalize_by_maxes = function(img, bandMaxes) {
    return img.divide(bandMaxes);
};

// Simple add mean to Band Name function
var afn_addMeanToBandName = (function(i) {
    return i + '_mean';
});

//reducing the aoi
var buffer_aoi = l18_3.clip(pointBuffer);

// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%  Parameters to function calls %%%%%%%%%%%%%%%%%%%%%%%

// Unsupervised KMeans Classification Parameters
var numberOfUnsupervisedClusters = 4;
var centerObjectYN = true;
var nativeScaleOfImage = 30;

var lndsatBands = [ "SR_B2","SR_B3", "SR_B4","SR_B5",'SR_B6',"NDBI", "NDVI",'NDWI','SAVI','UI','NDMI','TCB', 'TCG','TCW', 'TCA'];


/// Image Preprocessing 

var clippedImageSelectedBands = l18_3.select(lndsatBands);  //was using l8_image
print('l8_image_upsupervised clasification:',clippedImageSelectedBands);
// Per Pixel Unsupervised Classification for Comparison
var PerPixelUnsupervised = afn_Kmeans(clippedImageSelectedBands,
    numberOfUnsupervisedClusters, aoi, //changed from aoi
    nativeScaleOfImage);
print('l8_image_uPerPixelUnsupervised:',PerPixelUnsupervised);    
Map.addLayer(PerPixelUnsupervised.select('unsupervisedClass').randomVisualizer(), {}, 'Per-Pixel Unsupervised', false);


// &&&&&&&&&&&&&&&&&&&&&&&&&&   Training Dataset &&&&&&&&&&&&&&&&&
var nameProperties = training_set_updated.aggregate_array('Name');
// Get unique values
var uniqueNames = ee.List(nameProperties).distinct().getInfo();
print('classes', uniqueNames);

//var veg = training_set.filterMetadata('Name','equals','vegetation');
var vegetation = training_set_updated.filter(ee.Filter.eq('Name', 'vegetation'));
var bare = training_set_updated.filter(ee.Filter.eq('Name', 'bare'));
var mining = training_set_updated.filter(ee.Filter.eq('Name', 'mining'));
var builtup = training_set_updated.filter(ee.Filter.eq('Name', 'builtup'));


/// Create values for each class
var bare_up = bare.map(function(feature) {
  return feature.set('Name', 0); // Assign a unique class, e.g., 7 for roads
});
var builtup_up = builtup.map(function(feature) {
  return feature.set('Name', 1); // Assign a unique class, e.g., 7 for roads
});
var mining_up = mining.map(function(feature) {
  return feature.set('Name', 2); // Assign a unique class, e.g., 7 for roads
});
var vegetation_up = vegetation.map(function(feature) {
  return feature.set('Name', 3); // Assign a unique class, e.g., 7 for roads
});


//***&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&    adding other data &&&&&&&&&&&&&&&&&&&&&&&&&&&&*****
// Clip the roads feature collection to the buffer around the point
var kara_roads = roads.filterBounds(pointBuffer2);
var kara_water = waterways.filterBounds(pointBuffer2);

// JRC Yearly Water Classification History 30m GeoTiff (2015)
var waterClassification = ee.Image('JRC/GSW1_1/YearlyHistory/2015')
  .clip(aoi);
  
print(waterClassification);
var road = kara_roads.map(function(feature) {
  return feature.set('Name', 4); // Assign a unique class, e.g., 7 for roads
});
var water = kara_water.map(function(feature) {
  return feature.set('Name', 5); // Assign a unique class, e.g., 7 for roads
});

Map.addLayer(roads, {color: 'gray'}, 'Roads', false);

var distance_rds = roads.distance({searchRadius: 100}).rename('roads_distance');
//Map.addLayer(distance_rds, {min:0, max:100, palette: ['blue', 'white']}, 'Roads_Distance', false);
//waterways

Map.addLayer(waterways, {color: 'blue'}, 'Waterways', false);
var distance_wa = waterways.distance({searchRadius: 100}).rename('waterways_distance'); //10m
//Map.addLayer(distance_wa, {min:0, max:100, palette: ['brown', 'white']}, 'Water_Distance', false);


//var vegetation = vegetation.merge(treecover).merge(cropland);
var trainingSamples = bare_up.merge(builtup_up).merge(mining_up).merge(vegetation_up);//.merge(road).merge(water);
//print('Training samples',trainingSamples);


//%%%%%%%%%%%%%%    RS Indices visualization %%%%%%%%%%%%

// Define NDVI thresholds
var waterThreshold = [-1, -0.2];
var barrenThreshold = [-0.1, 0.1];
//var barrenTh = [-0.1, 0.1];
var shrubsGrasslandsThreshold = [0.2, 0.5];
var denseVegetationThreshold = [0.6, 1.0];

// Define colors for each NDVI range
var waterColor = 'blue';
var barrenColor = 'brown';
var shrubsGrasslandsColor = 'grey';
var denseVegetationColor = 'green';

// Apply color to NDVI ranges
var ndviColor_ = l18_3.select('NDVI').visualize({
  min: -1,
  max: 1,
  palette: [waterColor, barrenColor, shrubsGrasslandsColor, denseVegetationColor],
  opacity: 1
});

// Add NDVI layer to the map
Map.addLayer(ndviColor_, {}, 'NDVI Color_l8',false);

// Define NDBI thresholds
var LowBuilt = [-1, -0.760237];
var MediumBuilt = [-0.760237, 0.16808];
var HighBuilt = [0.16808, 0.42407];
var others_lulc = [0.42407, 1.0];

// Define colors for each NDBI range
var LowBuilt ='red' ;
var MediumBuilt = 'green';
var HighBuilt = 'orange';
var others_lulc = 'blue';

// Apply color to NDBI ranges
var ndbiColor_ = l18_3.select('NDBI').visualize({
  min: -1,
  max: 1,
  palette: [LowBuilt, MediumBuilt, HighBuilt,others_lulc],
  opacity: 1
});

// Add NDBI layer to the map
Map.addLayer(ndbiColor_, {}, 'NDBI Color_l8',false);

// Define UI thresholds
var LowBuilt = [-1, -0.56051];
var MediumBuilt = [-0.56051, 0.08623];
var HighBuilt = [0.08623, 0.38806];
var others_lulc = [0.38806, 1.0];

// Define colors for each NDVI range
var LowBuilt ='red' ;
var MediumBuilt = 'green';
var HighBuilt = 'yellow';
var others_lulc = 'blue';

// Apply color to NDVI ranges
var uiColor_ = l18_3.select('UI').visualize({
  min: -1,
  max: 1,
  palette: [LowBuilt, MediumBuilt, HighBuilt,others_lulc],
  opacity: 1
});

// Add NDBI layer to the map
Map.addLayer(uiColor_, {}, 'UI Color_l8',false);


var n_trees = 40;
//*&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&    Supervised classification: smileRandomForest &&&&&&&&&&&&&&&&&&&&&*
//******************************************/
//Select specific bands for classification
var classificationBands_l8 = ["SR_B2","SR_B3", "SR_B4","SR_B5",'SR_B6', "NDBI", "NDVI",'NDWI','SAVI','NBR','UI','TCB','TCG','TCW','TCA'];//"BLUE", "GREEN", "RED", "NIR",,'GCVI', "NDBI", "NDVI"
var buffer_aoi = l18_3.clip(aoi);
var l18_final = l18_3.select(classificationBands_l8); //chnaged from l18_3
//print('l18_final',l18_final);

// Add a random value field to the sample and use it to approximately split 80%
// of the features into a training set and 20% into a validation set.
var sample = trainingSamples.randomColumn();
var training = sample.filter('random <= 0.8');
var validation = sample.filter('random > 0.8');
print('validation data', validation);
// Select training data
var trainingData_l8 = l18_final.select(classificationBands_l8).sampleRegions({
    collection: training,
    properties: ['Name'],
    scale: 30,
});
print('trainingData_l8',trainingData_l8);

//validation
var validationData_l8 = l18_final.select(classificationBands_l8).sampleRegions({
    collection: validation,
    properties: ['Name'],
    scale: 30,
});
print('validationData_l8',validationData_l8);
// Train a classifier
var classifier_rf = ee.Classifier.smileRandomForest(n_trees).train({
    features: trainingData_l8,
    classProperty: "Name",
    inputProperties: classificationBands_l8,
});

//Get information about the trained classifier.
print('Results of smileRandomForest trained classifier', classifier_rf.explain());


// Get a confusion matrix and overall accuracy for the training sample.
var trainAccuracy = classifier_rf.confusionMatrix();
print('Training error matrix-smileRandomForest', trainAccuracy);
print('Training overall accuracy-smileRandomForest', trainAccuracy.accuracy());

// Get a confusion matrix and overall accuracy for the validation sample.
// Classify the validation data.
var validated_rf = validationData_l8.classify(classifier_rf);
var validationAccuracy = validated_rf.errorMatrix('Name', 'Name');
print('Validation error matrix-smileRandomForest', validationAccuracy);
print('Validation accuracy-smileRandomForest', validationAccuracy.accuracy());


// Aply classifier to image
var classifiedImage_RF = l18_final.classify(classifier_rf);

// Add Map Layer
var palette = [
    "red", // bare (1)
    "green", // mining
    "orange", // vegetation (3)
    "grey"// builtup 
   // "black",
   // 'blue'
    //"grey" //roads
];
var plotParameters = {
    min: 0,
    max: 3,
    palette: palette,
};

// Function to add layers to the map and export the result to Google Drive
var produceVisualization = function (image, description) {
    Map.addLayer(image, {}, description,false);
    Export.image.toDrive({
        image: image,
        description: description.replace(/\s+/g, ''),
        scale: 30,
        region: aoi,
        crs: "EPSG:4326",
        folder: "gee_output"
    });
};
produceVisualization(classifiedImage_RF.visualize(plotParameters), 'karamoja_LandCover_l8-RF');
//print(classifiedImage_RF);

//["SR_B2","SR_B3", "SR_B4","SR_B5",'SR_B6', "NDBI", "NDVI",'NDWI','SAVI','NBR','TCB','TCG','TCW','TCA']
// Define classification bands in groups of 4
var classificationBandsGroups = [
 // ["SR_B2", "SR_B3", "SR_B4"],
  //["SR_B3", "SR_B4", "SR_B5"],
  ["SR_B3", "SR_B4", "SR_B5","SR_B6"],
  ["SR_B2", "SR_B3", "SR_B4", "SR_B5",'SR_B6',"SR_B7"],
 // ['NDBI','UI'],
 // ["NDBI", "NDVI",'NDWI','SAVI'],
 // ["NDVI",'NDWI','SAVI','NBR'],
 // ['NDWI','SAVI','NBR','TCB','UI'],
 ['SAVI','NBR','TCB','TCG','TCW','TCA'],
  [ "NDVI",'SAVI','NBR','TCB','TCG','TCW','TCA'],
 // [ 'NBR','TCB','TCG','TCW','TCA'],
  ["NDBI", "NDVI",'NDWI','SAVI','NBR','UI','TCB','TCG','TCW']
];

// Initialize an empty classified image
var classifiedImage_l8_combined = ee.Image();

// Loop through classification bands groups
classificationBandsGroups.forEach(function(bandGroup){
  var l18_final_group = l18_3.select(bandGroup);
  
  // Select training data
  var trainingData_l8_group = l18_final_group.sampleRegions({
    collection: trainingSamples,
    properties: ["Name"],
    scale: 30,
  });

  // Train a classifier
  var classifier_l8_group = ee.Classifier.smileRandomForest(n_trees).train({
    features: trainingData_l8_group,
    classProperty: "Name",
    inputProperties: bandGroup,
  });

  // Apply classifier to image
  var classifiedImage_l8_group = l18_final_group.classify(classifier_l8_group);
 

  // Define visualization parameters for this group
  var plotParameters = {
      min: 0,
      max: 3,
      palette: palette,
  };

  // Visualize and export the classified image for this group
  produceVisualization(classifiedImage_l8_group.visualize(plotParameters), 'karamoja_LandCover_l8_Rf_' + bandGroup.join('_'));
});


//*&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&    Supervised classification: CART &&&&&&&&&&&&&&&&&&&&&*

// Train a CART classifier (up to 10 leaf nodes in each tree) from the
// training sample.
var trainedClassifier = ee.Classifier.smileCart(n_trees).train({
  features: trainingData_l8,
  classProperty: 'Name',
  inputProperties: l18_final.bandNames()
});

// Get information about the trained classifier.
//print('Results of trained classifier', trainedClassifier.explain());

// Get a confusion matrix and overall accuracy for the training sample.
var trainAccuracy = trainedClassifier.confusionMatrix();
print('Training error matrix-CART', trainAccuracy);
print('Training overall accuracy-CART', trainAccuracy.accuracy());

// Get a confusion matrix and overall accuracy for the validation sample.
var validated_cart = validationData_l8.classify(trainedClassifier);
var validationAccuracy = validated_cart.errorMatrix('Name', 'Name');
print('Validation error matrix-CART', validationAccuracy);
print('Validation accuracy-CART', validationAccuracy.accuracy());

// Classify the reflectance image from the trained classifier.
var imgClassified_cart = l18_final.classify(trainedClassifier);

Map.addLayer(imgClassified_cart, plotParameters, 'Classified_CART');


//*&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&    Supervised classification: smileGradientTreeBoost &&&&&&&&&&&&&&&&&&&&&*
// Train a 10-tree gradient boosting classifier from the training sample.
var trainedClassifier_GT = ee.Classifier.smileGradientTreeBoost(n_trees).train({
  features: trainingData_l8,
  classProperty: 'Name',
  inputProperties: l18_final.bandNames()
});


// Get information about the trained classifier.
print('Results of trained classifier-smileGradientTreeBoost', trainedClassifier_GT.explain());

// Get a confusion matrix and overall accuracy for the training sample.
var trainAccuracy = trainedClassifier_GT.confusionMatrix();
print('Training error matrix-smileGradientTreeBoost', trainAccuracy);
print('Training overall accuracy-smileGradientTreeBoost', trainAccuracy.accuracy());

// Get a confusion matrix and overall accuracy for the validation sample.
var validationSample_gtb = validationData_l8.classify(trainedClassifier);
var validationAccuracy = validationSample_gtb.errorMatrix('Name', 'Name');
print('Validation error matrix-smileGradientTreeBoost', validationAccuracy);
print('Validation accuracy-smileGradientTreeBoost', validationAccuracy.accuracy());

// Classify the reflectance image from the trained classifier.
var imgClassified_gradienttreeboost = l18_final.classify(trainedClassifier_GT);

Map.addLayer(imgClassified_gradienttreeboost, plotParameters, 'Classified_GTB');
Map.addLayer(training, {color: 'black'}, 'Training sample', false);
Map.addLayer(validation, {color: 'white'}, 'Validation sample', false);

//&&&&&&&&&&&&&&&& Area calcluations &&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
// Define an array of objects where each object contains the classified image and its name
var classifiedImages = [
  {image: classifiedImage_RF, name: 'classifiedImage_RF'},
  {image: imgClassified_cart, name: 'imgClassified_cart'},
  {image: imgClassified_gradienttreeboost, name: 'imgClassified_gradienttreeboost'}
]; // Add more images as needed

// Define the scale of the images (should match the scale of your classified images)
var scale = 30; // in meters

// Get the pixel area in square meters
var pixelAreaSqMeters = ee.Image.pixelArea().divide(1e6); // Convert to square kilometers

// Loop through each classified image
classifiedImages.forEach(function(classifiedObj) {
  var classifiedImage = classifiedObj.image;
  var classifiedName = classifiedObj.name;

  // Calculate the area occupied by each class
  var classArea = pixelAreaSqMeters.multiply(classifiedImage.eq(0)).rename('bare').addBands(
    pixelAreaSqMeters.multiply(classifiedImage.eq(1)).rename('builtup')).addBands(
    pixelAreaSqMeters.multiply(classifiedImage.eq(2)).rename('mining')).addBands(
    pixelAreaSqMeters.multiply(classifiedImage.eq(3)).rename('vegetation')).addBands(
    pixelAreaSqMeters.multiply(classifiedImage.eq(4)).rename('roads')).addBands(
    pixelAreaSqMeters.multiply(classifiedImage.eq(5)).rename('water'));

  // Reduce region to get the total area occupied by each class
  var classAreaStats = classArea.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: pointBuffer, // your region of interest
    scale: scale,
    maxPixels: 1e13
  });

  // Print the area statistics for the current classified image
  print('Class Area Statistics for ' + classifiedName + ':', classAreaStats);
});


//map the bufferered regions
Map.addLayer(bufferd_mining, {'color': 'black', 'opacity': 1, 'fillOpacity': 0}, 'buffered mining areas');

// //&&&&&&&&&&&&&&&&  LEGEND &&&&&&&&&&&&

// // Define the legend dictionary
// var legend = {
//   'Bare': 'ECCA9C',
//   'Mining': 'FDA403',
//   'vegetation': '114232',
//   'Built-up Areas': 'EE4266',
// 'roads': '8C6A5D',
// 'water': "5356FF"
// };

// // Function to add a legend to the map
// var addLegend = function(legend, position, title) {
//   // Create a legend panel
//   var legendPanel = ui.Panel({
//     style: {
//       position: position,
//       padding: '8px 15px'
//     }
//   });
  
//   // Create the title label
//   var titleLabel = ui.Label({
//     value: title,
//     style: {fontWeight: 'bold', fontSize: '16px', margin: '0 0 4px 0', padding: '0'}
//   });
  
//   // Add the title label to the legend panel
//   legendPanel.add(titleLabel);
  
//   // Iterate over the legend dictionary and add legend items
//   for (var key in legend) {
//     var color = legend[key];
//     var item = ui.Panel({
//       style: {
//         margin: '0 0 4px 0',
//         padding: '0'
//       }
//     });
    
//     // Create the color box
//     var colorBox = ui.Label({
//       style: {
//         backgroundColor: color,
//         padding: '8px',
//         margin: '0 6px 0 0'
//       }
//     });
    
//     // Create the text label
//     var label = ui.Label({
//       value: key,
//       style: {margin: '0 0 4px 6px'}
//     });
    
//     // Add the color box and text label to the legend item
//     item.add(colorBox).add(label);
    
//     // Add the legend item to the legend panel
//     legendPanel.add(item);
//   }
  
//   // Add the legend panel to the map
//   Map.add(legendPanel);
// };

// // Add the legend to the map
// addLegend(legend, 'bottom-right', 'Land Cover Legend');





