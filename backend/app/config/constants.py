# /app/config/constants.py
import json
import os

# Path to the shared tableConfigs.json file
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'tableConfigs.json')

# Load sharedTableConfigs from JSON
def load_table_configs():
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Configuration file not found at {CONFIG_PATH}. Ensure tableConfigs.json is created.")
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in {CONFIG_PATH}: {str(e)}")

SHARED_TABLE_CONFIGS = load_table_configs()

# Generate TABLE_COLUMNS from JSON
TABLE_COLUMNS = {
    table_name: [col['displayName'] for col in config['requiredColumns']]
    for table_name, config in SHARED_TABLE_CONFIGS.items()
}

# Generate COLUMN_ALIASES from JSON
COLUMN_ALIASES = {
    table_name: {
        col['fieldName']: col.get('aliases', [])
        for col in config['requiredColumns']
        if col.get('aliases')
    }
    for table_name, config in SHARED_TABLE_CONFIGS.items()
}