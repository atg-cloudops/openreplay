import requests

from decouple import config

SMR_URL = config("sourcemaps_reader").format(config("SMR_KEY", default="smr"))


def get_original_trace(key, positions, is_url=False):
    payload = {
        "key": key,
        "positions": positions,
        "padding": 5,
        "bucket": config('sourcemaps_bucket'),
        "isURL": is_url
    }
    try:
        r = requests.post(SMR_URL, json=payload, timeout=config("sourcemapTimeout", cast=int, default=5))
        if r.status_code != 200:
            print(f"Issue getting sourcemap status_code:{r.status_code}")
            return None
        return r.json()
    except requests.exceptions.Timeout:
        print("Timeout getting sourcemap")
        return None
    except Exception as e:
        print("Issue getting sourcemap")
        print(e)
        return None
