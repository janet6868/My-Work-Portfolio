
// Load the Ghana feature collection
var ghana_aoi = ee.FeatureCollection('projects/ee-janet/assets/Ghana/Grids_Buffer_half_d_AOI');

var geometry = ghana_aoi.geometry();

Map.centerObject(geometry);
// .area() function calculates the area in square meters
var aoiArea = geometry.area()

// We can cast the result to a ee.Number() and calculate the
// area in square kilometers
var aoiAreaSqKm = ee.Number(aoiArea).divide(1e6).round()
print('Total AOI Area(sqkm)', aoiAreaSqKm)


//++++++++++++++  SEPAL classification ++++++++++++++++++++++++++
// Define the cloud mask function
function maskS2(image) {
  var cloudBitMask = ee.Number(2).pow(10).int();
  var cirrusBitMask = ee.Number(2).pow(11).int();
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

// Load Sentinel-2 image collection
var s2 = ee.ImageCollection('COPERNICUS/S2_SR');

//Display the rgb images
var imageVisParam = {
    'bands': ['red','green','blue'],
    'min': 119,
    'max': 1577,
};

// Display the images on the map
function displayRgb(image, imageName) {
  // Add the image to the map for visualization
  Map.addLayer(image, imageVisParam, imageName, false);
  
 // Define export parameters
    var exportParams = {
        'image': image,
        'description': imageName ,
        'scale': 10,
        'region': image.geometry().bounds(),
        'fileFormat': 'GeoTIFF',
        'maxPixels': 1e12
    };
    
    // Export the image to Google Drive
    Export.image.toDrive(exportParams);
}


var image = [image_2013, image_2014, image_2015,image_2016,image_2017,image_2018,
              image_2019,image_2020,image_2021,image_2022,image_2023];
var imageName = ['rgb_2013','rgb_2014', 'rgb_2015','rgb_2016','rgb_2017','rgb_2018',
                  'rgb_2019','rgb_2020','rgb_2021','rgb_2022','rgb_2023'];

// Export images for each region
for (var i = 0; i < image.length; i++) {
    displayRgb(image[i], imageName[i]);
   // exportRegionImage(image[i], imageName[i]);
}

   
// Define the visualization parameters
var vis_params = {
    'bands': ['class'], 
    'min': 1,
    'max': 7,
    'palette': ["0b4a04", '54B435', "4cff14", "ff0e00", "fffc62", '65451F', "1610ff"]
};


//*************export names********************
var region = [grid_class_2013, grid_class_2014,grid_class_2015,grid_class_2016,
              grid_class_2017, grid_class_2018,grid_class_2019,grid_class_2020,
                grid_class_2021,grid_class_2022, grid_class_2023,grid_class_2022_v2,
                grid_class_2023_s1,grid_class_2022_s1,grid_class_2021_s1,grid_class_2020_s1,grid_class_2019_s1,
                grid_class_2018_s1,grid_class_2017_s1];
                // ,grid_class_2022_s1,
                // grid_class_2020_s1];
                
var region_name = ["grid_class_2013","grid_class_2014","grid_class_2015","grid_class_2016",
                    "grid_class_2017","grid_class_2018","grid_class_2019","grid_class_2020",
                    "grid_class_2021", "grid_class_2022","grid_class_2023",'grid_class_2022_v2',
                    'grid_class_2023_s1','grid_class_2022_s1','grid_class_2021_s1',
                    'grid_class_2020_s1','grid_class_2019_s1','grid_class_2018_s1','grid_class_2017_s1'];
                  // 'grid_class_2022_v2','grid_class_2023_s1','grid_class_2022_s1',
                  // 'grid_class_2021_s1','grid_class_2020_s1'];




// Set the visualization parameters
var vis_params = {
  bands: ['class'],
  min: 1,
  max: 7,
  //gamma: 1.0,
  palette: ["0b4a04",'367E18',"4cff14","ff0e00","fffc62",'65451F',"1610ff"]
};

// Create a legend
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px'
  }
});

var legendTitle = ui.Label({
  value: 'Legend',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});

legend.add(legendTitle);

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });

  var description = ui.Label({
    value: name,
    style: { margin: '0 0 4px 6px' }
  });

  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};


var palette = vis_params['palette'];
var names = ['Closed Forest','Open Forest', 'Croplands', 'Mining', 'Built up','Bare land', 'Water'];

for (var i = 0; i < 7; i++) {
  legend.add(makeRow(palette[i], names[i]));
}

// Add the legend to the map
Map.add(legend);
//*********************Calculate the areas******************************
//A binary image is an image where each pixel is represented by only one value, typically 0 or 1. 
//In the context of your classification result, a binary image for a specific class contains pixels 
//with a value of 1 where that class is present and pixels with a value of 0 where the class is not present.


// Define the function to export images and calculate class areas
function exportRegionImage(region, regionName) {
    // Add the region image layer to the map
    Map.addLayer(region, vis_params, regionName,false);
    
    // Define export parameters
    var exportParams_ = {
        'image': region,
        'description': regionName + '_classification',
        'scale': 100,
        'region': region.geometry().bounds(),
        'fileFormat': 'GeoTIFF',
        'maxPixels': 1e12
    };
    
    // Export the image to Google Drive
    Export.image.toDrive(exportParams_);
    
    // Calculate class areas
    var classAreas = [];
    for (var classValue = 1; classValue <= 7; classValue++) {
        var classImage = region.select('class').eq(classValue);
        var classArea = classImage.multiply(ee.Image.pixelArea());
        var classStats = classArea.reduceRegion({
            reducer: ee.Reducer.sum(),
            geometry: region.geometry(),
            scale: 10,
            maxPixels: 1e12
        });
        classAreas.push(classStats.get('class'));
    }
    
    // Print class areas
    print(regionName + ' Class Areas:', classAreas);
}

// Export images for each region
for (var i = 0; i < region.length; i++) {
    exportRegionImage(region[i], region_name[i]);
}
