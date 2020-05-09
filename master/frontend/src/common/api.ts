export function getCookieVal(key: string): string {
  let cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    cookie = cookie.trim();
    const [name, value] = cookie.split('=');
    if (name.includes(key)) {
      return value.replace(/"/g, '').trim();
    }
  }
  return '';
}

export async function api(endpoint: string = 'system', method: string = 'GET', body: any = null) {
  const API_KEY: string = getCookieVal('master_api_key');
  const API_URL: string = getCookieVal('master_api_url');

  return new Promise((resolve, reject) => {
    let url = `${API_URL}/${endpoint}`;

    if (method.toLowerCase() === 'get') {
      if (url.includes('?')) {
        url += ('&API_KEY=' + API_KEY);
      } else {
        url += ('?API_KEY=' + API_KEY);
      }
    }

    let options: any = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
    };

    let body_payload: any = {

    };

    if (body) {
      Object.assign(body_payload, body);
    }

    if (method !== 'GET') {
      body_payload['API_KEY'] = API_KEY;
      options['body'] = JSON.stringify(body_payload);
    }

    console.log(url);

    fetch(url, options)
      .then((response) => {
        return response.json();
      })
      .then((myJson) => {
        resolve(myJson);
      }).catch((err) => {
        reject(err);
      });
  })
}

export function getDownloadUrl(task_id: string) {
  let API_KEY = getCookieVal('master_api_key');
  let API_URL = getCookieVal('master_api_url');
  return `${API_URL}/download_sample?sample_size=10&id=${task_id}&API_KEY=${API_KEY}`;
}