#!/usr/bin/env bash

# load env file
export $(grep -v '^#' env/production.env | xargs -0);

urlencode() {
    # urlencode <string>
    old_lc_collate=$LC_COLLATE
    LC_COLLATE=C

    local length="${#1}"
    for (( i = 0; i < length; i++ )); do
        local c="${1:i:1}"
        case $c in
            [a-zA-Z0-9.~_-]) printf "$c" ;;
            *) printf '%%%02X' "'$c" ;;
        esac
    done

    LC_COLLATE=$old_lc_collate
}

api_key_encoded=$(urlencode "$API_KEY")
api_url_encoded=$(urlencode "https://$MASTER_IP:9001")

# launch chromium browser with frontend site

echo "http://$MASTER_IP:8080/?master_api_key=$api_key_encoded&master_api_url=$api_url_encoded"

chromium-browser "http://$MASTER_IP:8080/?master_api_key=$api_key_encoded&master_api_url=$api_url_encoded"
