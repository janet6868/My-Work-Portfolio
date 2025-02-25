#@title Working on accumulation function
import ee
import geemap
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from tqdm import tqdm 
import os

class FloodDetector:
    def __init__(self, project_id='ee-janet'):
        """Initialize the flood detection system"""
        ee.Initialize(project='ee-janet')
        self._init_regions()

    def _init_regions(self):
        """Initialize analysis regions and masks"""
        # Load base regions
        self.grid = ee.FeatureCollection("projects/ee-janet/assets/senegal/52_grid_dagana")
        self.init_dagana = ee.FeatureCollection("projects/ee-janet/assets/senegal/dagana")

        # Load water-related features
        water_features = {
            'reservoir': "projects/ee-janet/assets/senegal/dagana_reservoir",
            'water': "projects/ee-janet/assets/senegal/dagana_water",
            'riverbanks': "projects/ee-janet/assets/senegal/dagana_riverbanks",
            'wetland': "projects/ee-janet/assets/senegal/dagana_wetland",
            'exclusion': "projects/ee-janet/assets/senegal/dagana_exclusion_region"
        }

        # Create exclusion geometry
        exclusion_areas = ee.FeatureCollection([]).geometry()
        for feature in water_features.values():
            exclusion_areas = exclusion_areas.union(
                ee.FeatureCollection(feature).geometry()
            )

        # Define study area excluding permanent water
        self.study_area = self.init_dagana.geometry().difference(exclusion_areas)

    def _get_landcover_mask(self):
        """Create landcover mask from ESA WorldCover"""
        worldcover = ee.ImageCollection("ESA/WorldCover/v200").first()
        return worldcover.select('Map').remap(
            [20, 30, 50, 60, 90],  # Shrublands, grass, built, bare, herbaceous
            [0, 0, 0, 0, 0],       # Mask out these areas
            1                       # Keep other classes
        ).clip(self.study_area)

    def _get_water_mask(self):
        """Create permanent water mask from JRC dataset"""
        jrc = ee.Image("JRC/GSW1_4/MonthlyHistory/2021_01")
        permanent_water = jrc.select('water').eq(2)
        permanent_waterMask= permanent_water.unmask(0).Not()
        not_permanent_water = permanent_water.updateMask(permanent_water.Not())
        return permanent_waterMask

    def _get_slope_mask(self, max_slope=5):
        """Create slope mask from HydroSHEDS"""
        dem = ee.Image('WWF/HydroSHEDS/03VFDEM')
        return ee.Algorithms.Terrain(dem).select('slope').lt(max_slope)
    #Values below -45.0 dB are considered as noise
    def get_sentinel1_collection(self, start_date, end_date):
        """Get filtered Sentinel-1 collection for specified time period"""
        collection = (ee.ImageCollection('COPERNICUS/S1_GRD')
            .filter(ee.Filter.eq('instrumentMode', 'IW'))
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
            .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
            .filter(ee.Filter.bounds(self.study_area))
            .select('VV')
            .map(lambda img: img.updateMask(
                img.mask().And(img.lt(-45.0).Not())
            ))
            .filter(ee.Filter.date(start_date, end_date))
            .mosaic()
            .clip(self.study_area))

        return collection

    #@staticmethod
    def get_available_dates(self, start_date, end_date):
        """
        Get actual Sentinel-1 acquisition dates for the study area

        Args:
            start_date (str): Start date in 'YYYY-MM-DD' format
            end_date (str): End date in 'YYYY-MM-DD' format

        Returns:
            list: List of available dates sorted chronologically
        """
        # Get Sentinel-1 collection
        collection = (ee.ImageCollection('COPERNICUS/S1_GRD')
            .filter(ee.Filter.eq('instrumentMode', 'IW'))
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
            .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
            .filter(ee.Filter.bounds(self.study_area))
            .filter(ee.Filter.date(start_date, end_date)))

        # Get list of dates
        dates_ = collection.aggregate_array('system:time_start').getInfo()
        dates = [datetime.fromtimestamp(d/1000).strftime('%Y-%m-%d') for d in dates_]

        # Remove duplicates and sort
        dates = sorted(list(set(dates)))

        print("Available acquisition dates:")
        for i, date in enumerate(dates):
            if i > 0:
                delta = (datetime.strptime(date, '%Y-%m-%d') -
                        datetime.strptime(dates[i-1], '%Y-%m-%d')).days
                print(f"{date} (interval: {delta} days)")
            else:
                print(date)

        return dates


    #@staticmethod
    def get_doy(self,date_string):
      """Get the day of year (1–365/366) for a given date string."""
      date = datetime.strptime(date_string, '%Y-%m-%d')
      return date.timetuple().tm_yday
    
    @staticmethod
    def _to_natural(img):
        """Convert from dB to natural values"""
        return ee.Image(10.0).pow(img.divide(10.0))

    @staticmethod
    def _to_db(img):
        """Convert from natural values to dB"""
        return ee.Image(img).log10().multiply(10.0)

    @staticmethod
    def _refined_lee(img):
        """Apply Refined Lee speckle filter"""
        def process_band(band_name):
            band = img.select([band_name])

            # Calculate statistics in 7x7 kernel
            mean = band.reduceNeighborhood(
                reducer=ee.Reducer.mean(),
                kernel=ee.Kernel.square(7),
                skipMasked=True
            )

            variance = band.reduceNeighborhood(
                reducer=ee.Reducer.variance(),
                kernel=ee.Kernel.square(7),
                skipMasked=True
            )

            # Calculate coefficient of variation
            ci = variance.sqrt().divide(mean.add(ee.Image.constant(1e-6)))

            # Compute adaptive weights
            weight = ci.expression('b(0) < 0.5 ? 1 : (b(0) < 1 ? 0.5 : 0)')

            # Apply filtering
            return band.multiply(weight).add(
                mean.multiply(ee.Image.constant(1).subtract(weight))
            ).rename([band_name])

        band_names = img.bandNames()
        filtered_bands = ee.List(band_names).map(process_band)
        return ee.ImageCollection(filtered_bands).toBands().rename(band_names)
        
    def _get_edge_image(self, vv_band, edge_params=None):
            """
            Get edge image for adaptive thresholding.
            
            Args:
                vv_band (ee.Image): VV band image
                edge_params (dict): Optional parameters for edge detection
                
            Returns:
                ee.Image: Edge image for histogram calculation
            """
            if edge_params is None:
                edge_params = {
                    'connected_pixels': 10,  # Increased from 10
                    'edge_length': 10,      # Decreased from 15
                    'edge_buffer': 15,      # Increased from 10
                    'canny_threshold': 0.5,  # Decreased from 0.8
                    'canny_sigma': 1.5,     # Increased from 1.0
                    'canny_lt': 0.05        # Increased from 0.03
            }
            # Create initial binary image
            binary = vv_band.lt(-15.097860140429926).rename('binary')
            
            # Detect edges using Canny edge detector
            canny = ee.Algorithms.CannyEdgeDetector(
                image=binary,
                threshold=edge_params['canny_threshold'],
                sigma=edge_params['canny_sigma']
            )
            
            # Process connected pixels
            connected = (canny.updateMask(canny)
                        .lt(edge_params['canny_lt'])
                        .connectedPixelCount(edge_params['connected_pixels'], True))
            
            edges = connected.gte(edge_params['edge_length'])
            
            # Create buffer around edges
            img_proj = vv_band.projection()
            edge_buffer_px = (ee.Number(edge_params['edge_buffer'])
                             .divide(img_proj.nominalScale()))
            buffered_edges = edges.fastDistanceTransform().lt(edge_buffer_px)
            
            # Return the masked image
            return vv_band.updateMask(buffered_edges)
    @staticmethod
    def _otsu(histogram):
        """Implement Otsu thresholding"""
        counts = ee.Array(histogram.get('histogram'))
        means = ee.Array(histogram.get('bucketMeans'))
        size = means.length().get([0])
        total = counts.reduce(ee.Reducer.sum(), [0]).get([0])
        sum_means = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0])
        mean = sum_means.divide(total)

        def calc_bss(i):
            # Calculate between-class variance
            a_counts = counts.slice(0, 0, i)
            a_count = a_counts.reduce(ee.Reducer.sum(), [0]).get([0])
            a_means = means.slice(0, 0, i)
            a_mean = a_means.multiply(a_counts).reduce(ee.Reducer.sum(), [0]).get([0]).divide(a_count)
            b_count = total.subtract(a_count)
            b_mean = sum_means.subtract(a_count.multiply(a_mean)).divide(b_count)
            return a_count.multiply(a_mean.subtract(mean).pow(2)).add(
                b_count.multiply(b_mean.subtract(mean).pow(2)))

        indices = ee.List.sequence(1, size)
        bss = indices.map(calc_bss)

        return means.sort(bss).get([-1])
        
    def _adaptive_threshold(self, img, init_threshold=-14.097860140429926):
        """Apply adaptive thresholding to detect water"""
        vv_band = img.select(0)
        #binary = vv_band.lt(init_threshold).rename('binary')
        edge_image = self._get_edge_image(vv_band)

        # Calculate histogram
        histogram = ee.Dictionary(
            edge_image.reduceRegion(
                reducer=ee.Reducer.histogram(255, 0.1),#255, 0.1
                geometry=self.study_area,
                scale=10,
                maxPixels=1e10
            ).get(edge_image.bandNames().get(0))
        )

        # Apply Otsu thresholding
        threshold = self._otsu(histogram)
        return vv_band.lt(threshold)
        
    def plot_adaptive_histogram(self, image, title, save_path='save_path'):
        """
        Plot and save adaptive histogram with threshold

        Args:
            image (ee.Image): Input image
            title (str): Plot title
            save_path (str): Path to save the plot (optional)

        Returns:
            tuple: (threshold_value, histogram_data)
        """
        vv_band = image.select(0)
        edge_image = self._get_edge_image(vv_band)

        # Calculate histogram
        histogram = ee.Dictionary(
            edge_image.reduceRegion(
                reducer=ee.Reducer.histogram(255, 0.1),#
                geometry=self.study_area,
                scale=10,
                maxPixels=1e10
            ).get(edge_image.bandNames().get(0))
        )

        # Calculate threshold
        local_threshold = self._otsu(histogram)
        threshold_value = local_threshold.getInfo()

        # Get histogram data
        x = ee.List(histogram.get('bucketMeans')).getInfo()
        y = ee.List(histogram.get('histogram')).getInfo()

        # Create and save plot
        plt.figure(figsize=(4, 4))
        plt.fill_between(x, y, alpha=0.3, color='#1f77b4')
        plt.plot(x, y, color='#1f77b4', linewidth=2)
        plt.axvline(x=threshold_value, color='r', linestyle='--', label=f'Threshold: {threshold_value:.2f}')
        plt.title(f"{title} VV Adaptive Histogram")
        plt.xlabel('Backscatter [dB]')
        plt.ylabel('Count')
        plt.xlim(-45, 0)
        plt.grid(True, alpha=0.3)
        plt.legend()
        plt.show()
        plt.close()
        if save_path:
            plt.savefig(save_path)
            plt.close()
        else:
            plt.show()

        return threshold_value, {'means': x, 'histogram': y}
        
    #calculate grid-wise areas
    def calculate_grid_flood_area( self, flood_mask,date):
      """
      Calculate flood area for each grid cell.
      """
    
      def calculate_area(feature):
          area = flood_mask.multiply(ee.Image.pixelArea()).reduceRegion(
              reducer=ee.Reducer.sum(),
              geometry=feature.geometry(),
              scale=10,
              maxPixels=1e9
          )
          area_ha = area.getNumber('constant').divide(10000).format('%.2f')
          return feature.set({'flood_area_ha': area_ha, 'date': date})

      return self.grid.map(calculate_area)

    @staticmethod
    def extract_flood_data(features, date):
        """
        Extract flood data from a FeatureCollection's .getInfo()['features'] structure.
        """
        flooded_data = []
        for feature in features:
            grid_id = feature['properties']['ID']
            flood_area_ha = feature['properties'].get('flood_area_ha', 0)
            flooded_data.append({
                'date': date,
                'grid_id': grid_id,
                'flood_area_ha': flood_area_ha,
                **{k: v for k, v in feature['properties'].items()
                  if k != 'flood_area_ha'}
            })
        return flooded_data

    @staticmethod
    def create_flood_dataframe(flooded_data):
        """
        Convert list of dictionaries to a Pandas DataFrame and set multi-index.
        """
        df = pd.DataFrame(flooded_data)
        if df.empty:
            return pd.DataFrame()  # return empty if no data
        df['date'] = pd.to_datetime(df['date'])
        df.set_index(['date', 'grid_id'], inplace=True)
        return df
        
    def process_flood_results(df, grid_properties):
        """
        Post-process the flood results to merge with any additional grid properties.
        """
        df['flood_area_ha'] = pd.to_numeric(df['flood_area_ha'], errors='coerce').fillna(0)
        if isinstance(grid_properties, pd.DataFrame):
            final_df = pd.merge(df.reset_index(), grid_properties, on='grid_id', how='left')
        else:
            final_df = df
        return final_df

    def detect_floods(self, before_start, before_end, after_start,
                     diff_threshold=1.15):
        """
        Detect flooded areas between two time periods

        Args:
            before_start (str): Start date of before period
            before_end (str): End date of before period
            after_start (str): Start date of after period
            after_end (str): End date of after period
            diff_threshold (float): Threshold for change detection

        Returns:
            tuple: (flood_mask, flood_stats, visualization_data)
        """
        # the dates
        # Define the date range ±5 days around the target date
        target_date = datetime.strptime(after_start, "%Y-%m-%d")
        after_start = target_date #- timedelta(days=5)).strftime("%Y-%m-%d")
        after_end = (target_date + timedelta(days=12)).strftime("%Y-%m-%d")
        #after_end = 
        # Get imagery
        before_img = self.get_sentinel1_collection(before_start, before_end)
        after_img = self.get_sentinel1_collection(after_start, after_end)

        # Apply filtering
        before_filtered = ee.Image(self._to_db(self._refined_lee(self._to_natural(before_img))))
        after_filtered = ee.Image(self._to_db(self._refined_lee(self._to_natural(after_img))))

        # Get masks
        landcover_mask = self._get_landcover_mask()
        water_mask = self._get_water_mask()
        slope_mask = self._get_slope_mask()
        
        #inclusion_mask = water_mask.And(landcover_mask)
        # Detect water
        before_water_ = self._adaptive_threshold(before_filtered)
        after_water_ = self._adaptive_threshold(after_filtered)

        # Apply masks
        before_water = before_water_.updateMask(landcover_mask).updateMask(water_mask)
        after_water = after_water_.updateMask(landcover_mask).updateMask(water_mask)

        # Change detection
        difference = after_filtered.divide(before_filtered)
        threshold_change = difference.gt(diff_threshold).rename('flood').selfMask()

        # Final flood mask
        #Area must be water in the "after" period
        #Area must show significant increase in radar return
        detected_flood_areas = after_water.And(threshold_change)

        # # Create visualization outputs
        stats = {
            'before_filtered': before_filtered,
            'after_filtered': after_filtered,
            'before_water': before_water,
            'after_water': after_water,
            'change_detection':difference,
            'threshold_change': threshold_change,
           'flood_areas': detected_flood_areas
        }

        # Plot adaptive thresholds
        print("\nCalculating thresholds:")
       # self.plot_adaptive_histogram(before_filtered, "Before Period")
       # self.plot_adaptive_histogram(after_filtered, "After Period")

        return threshold_change, stats#detected_flood_areas, viz_data#, stats,
    
    def analyze_satellite_time_series(self, reference_start, reference_end,
                                analysis_start, analysis_end, output_dir='threshold_plots'):
        """
        Analyze flood areas using actual Sentinel-1 acquisition dates with improved accumulation
    
        Args:
            reference_start (str): Start date of reference period
            reference_end (str): End date of reference period
            analysis_start (str): Start date for analysis
            analysis_end (str): End date for analysis
            output_dir (str): Directory to save threshold plots
    
        Returns:
            dict: Time series of flood statistics and visualizations
        """
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        # Get available dates
        dates_ranges= self.get_available_dates(analysis_start, analysis_end)
        print(dates_ranges)
    
        # Initialize results
        results = {
            'dates': [],
            'flood_areas': [],
            'visualizations': [],
            'intervals': [],
            'thresholds': [],
            'cumulative_data': []
        }
    
        # Create map for time series
        Map = geemap.Map()
        Map.add_basemap('HYBRID')
        Map.centerObject(self.study_area, 10)
    
        # Set up legend
        legend_dict = {
            'New Floods': '#FF0000',
            'Accumulated Floods': '#800000',
            'Water Bodies': '#0000FF'
        }
    
        # Initialize cumulative flood mask
        prev_s1_coll = (
            ee.ImageCollection('COPERNICUS/S1_GRD')
            .filterBounds(self.study_area)
            .filterDate(reference_start, reference_end)
        )
        projection = prev_s1_coll.mosaic().select('VV').projection()
        cumulative_flood_mask = ee.Image(0).reproject(crs=projection, scale=10).clip(self.study_area)
        
        # Track monthly accumulation
        monthly_data = {}
        flood_data2 =[]
        current_month = None
        
        # Process each date
        #for i in range(len(dates)-1):
        for i, date in tqdm(enumerate(dates_ranges), total=len(dates_ranges), desc="Processing Dates"):
            date_obj = datetime.strptime(date, "%Y-%m-%d")
            month_key =date_obj# f"{date_obj.year}-{date_obj.month:02d}"
    
            try:
                # Detect floods for this period
                current_flood_mask, viz_data = self.detect_floods(reference_start, reference_end,date)
                doy = self.get_doy(date)
                base_date_mask = current_flood_mask
                if i == 0:
                    cumulative_flood_mask = cumulative_flood_mask.where(base_date_mask, doy)
                else:
                    new_areas = current_flood_mask.And(cumulative_flood_mask.eq(0))
                    cumulative_flood_mask = cumulative_flood_mask.where(new_areas, doy)
    
                # Calculate grid-wise flood areas
                # Convert date string to proper format
                #formatted_date = datetime.strptime(current_end, '%Y-%m-%d').strftime('%Y-%m-%d')
                grid_with_flood_area = self.calculate_grid_flood_area(cumulative_flood_mask.updateMask(cumulative_flood_mask).gt(0), self.grid)
                flood_data2.extend(self.extract_flood_data(grid_with_flood_area.getInfo()['features'], date))
                   
                # Process grid features
                try:
                    fc_info = grid_with_flood_area.getInfo()
                    features = fc_info.get('features', [])
                    if features:
                        flood_data = self.extract_flood_data(features, date)
                        
                        # Aggregate monthly data
                        if month_key not in monthly_data:
                            monthly_data[month_key] = {
                                'flood_mask': current_flood_mask,
                                'data': flood_data
                            }
                        else:
                            monthly_data[month_key]['flood_mask'] = (
                                monthly_data[month_key]['flood_mask'].Or(current_flood_mask)
                            )
                            monthly_data[month_key]['data'].extend(flood_data)
                    
                except Exception as e:
                    print(f"Error processing grid features for {date}: {e}")
                    continue
    
                # Handle end of month visualization
                if (i == len(dates_ranges) - 2 or #updated dates to dates_ranges
                    datetime.strptime(dates_ranges[i + 2], "%Y-%m-%d").month != date_obj.month):
                    
                    # Add monthly accumulated layer
                    monthly_layer_name = f'Accumulated_Floods_{date_obj}'
                    monthly_mask = monthly_data[month_key]['flood_mask']
                    # Map.addLayer(
                    #     monthly_mask.selfMask(),
                    #     {'palette': ['800000']},
                    #     monthly_layer_name,
                    #     False
                    # )
    
                    # Export monthly data if needed
                    # self.export_monthly_flood_data(monthly_data[month_key], month_key)
    
                # Add current flood layer
                # Map.addLayer(
                #     current_flood_mask.selfMask(),
                #     {'palette': ['FF0000']},
                #     f'New_Floods_{date}',
                #     False
                # )
    
                # Store results
                results['dates'].append(date)
                #results['intervals'].append((current_start, date))
                results['flood_areas'].append(grid_with_flood_area)
                results['visualizations'].append(viz_data)
                results['cumulative_data'].append({
                    'date': date,
                    'monthly_key': month_key,
                    'flood_area': grid_with_flood_area
                })
    
            except Exception as e:
                print(f"Error processing period {date}: {str(e)}")
                continue
    
        # Add legend and save map
        # Map.add_legend(
        #     title="Flood Detection Legend",
        #     legend_dict=legend_dict,
        #     position='bottomright'
        # )
        # Map.save(os.path.join(output_dir, 'flood_time_series_map.html'))
        # Map
        results['map'] = Map
        results['monthly_data'] = monthly_data
        results['more_flooded_data'] = flood_data2
    
        return results
    
    def plot_satellite_time_series(self, results, output_dir='time_series_plots'):
        """
        Plot time series of flooded areas with actual acquisition dates

        Args:
            results (dict): Results from analyze_satellite_time_series
            output_dir (str): Directory to save plots
        """
        os.makedirs(output_dir, exist_ok=True)

        # Plot flood areas over time
        plt.figure(figsize=(4, 4))

        # Create main plot
        dates = [datetime.strptime(d, '%Y-%m-%d') for d in results['dates']]
        plt.plot(dates, results['flood_areas'], 'b-', marker='o')

        # Add interval annotations
        for i, (area, thresholds) in enumerate(zip(results['flood_areas'], results['thresholds'])):
            interval_days = (datetime.strptime(results['intervals'][i][1], '%Y-%m-%d') -
                           datetime.strptime(results['intervals'][i][0], '%Y-%m-%d')).days

            # Add interval annotation
            plt.annotate(f'{interval_days}d\nBefore: {thresholds["before"]:.1f}dB\nAfter: {thresholds["after"]:.1f}dB',
                        (dates[i], area),
                        xytext=(10, 10),
                        textcoords='offset points',
                        fontsize=8,
                        bbox=dict(facecolor='white', edgecolor='none', alpha=0.7))

        plt.title('Flooded Area Over Time\nwith Sentinel-1 Acquisition Intervals and Thresholds')
        plt.xlabel('Date')
        plt.ylabel('Flooded Area (Ha)')
        plt.grid(True)
        plt.xticks(rotation=45)
        plt.tight_layout()

        # Save plot
        plt.savefig(os.path.join(output_dir, 'flood_time_series.png'))
        plt.close()

        # Create threshold analysis plot
        plt.figure(figsize=(6, 6))
        before_thresholds = [t['before'] for t in results['thresholds']]
        after_thresholds = [t['after'] for t in results['thresholds']]

        plt.plot(dates, before_thresholds, 'b-', marker='o', label='Before Period')
        plt.plot(dates, after_thresholds, 'r-', marker='o', label='After Period')

        plt.title('Adaptive Thresholds Over Time')
        plt.xlabel('Date')
        plt.ylabel('Threshold Value (dB)')
        plt.grid(True)
        plt.legend()
        plt.xticks(rotation=45)
        plt.tight_layout()

        # Save threshold plot
        plt.savefig(os.path.join(output_dir, 'threshold_time_series.png'))
        plt.close()
   
   
    def visualize_results(self, flood_mask, before_filtered, after_filtered,
                         before_water, after_water, change_detection):
        """Create interactive map with results"""
        m = geemap.Map()
        m.centerObject(self.study_area, 10)

        # Add layers
        layer_config = [
            (before_filtered, {'min': -25, 'max': 0}, 'Before Filtered', False),
            (after_filtered, {'min': -25, 'max': 0}, 'After Filtered', False),
             (before_water, {'palette': 'blue'}, 'Before Water', False),
            (after_water, {'palette': 'cyan'}, 'After Water', False),
            (change_detection, {'palette': 'yellow'}, 'Change Detection', False),
            (flood_mask, {'palette': 'red'}, 'Flood Areas', True)
            # (before_water.selfMask(), {'palette': 'blue'}, 'Before Water', False),
            # (after_water.selfMask(), {'palette': 'cyan'}, 'After Water', False),
            # (change_detection.selfMask(), {'palette': 'yellow'}, 'Change Detection', False),
            # (flood_mask.selfMask(), {'palette': 'red'}, 'Flood Areas', True)
        ]

        for img, vis_params, name, visible in layer_config:
            m.addLayer(img, vis_params, name, visible)

        return m

   

