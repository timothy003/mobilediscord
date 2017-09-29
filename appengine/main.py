import os
from urllib import quote
from urlparse import urlsplit
import logging
from google.appengine.api import urlfetch, urlfetch_errors
from werkzeug.datastructures import Headers
from flask import Flask, request, abort

app = Flask(__name__)
app.config['DEBUG'] = True

def get_forward_url():
    if request.host.startswith('canary'):
        url = 'https://canary.discordapp.com'
    elif request.host.startswith('ptb'):
        url = 'https://ptb.discordapp.com'
    else:
        url = 'https://discordapp.com'
    url += quote(request.environ.get('PATH_INFO') or '/')
    if request.query_string:
        url += '?'
        url += request.query_string
    return url

def get_links():
    if not hasattr(get_links, 'cached'):
        stat = os.stat('links.html')
        etag = '-md-%x-%x' % (stat.st_mtime, stat.st_size)
        with open('links.html') as f:
            get_links.cached = etag, f.read()
    return get_links.cached

def get_scripts():
    if not hasattr(get_scripts, 'cached'):
        with open('scripts.html') as f:
            get_scripts.cached = f.read()
    return get_scripts.cached

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def proxy(path):
    try:
        url = get_forward_url()
        headers = request.headers
        headers_to_strip = ['host', 'if-none-match', 'x-cloud-trace-context', 'x-google-apps-metadata', 'x-zoo']
        etag, links = get_links()
        if not request.if_none_match.contains_weak(etag):
            headers_to_strip.append('if-modified-since')
        headers = Headers([(k, v) for k, v in headers if (lambda name: not name.startswith('x-appengine-') and not name.startswith('cf-') and name not in headers_to_strip)(k.lower())])
        result = urlfetch.fetch(url, headers=headers, follow_redirects=False, validate_certificate=True)
        response, status, headers = result.content, result.status_code, result.headers
        if status == 200 or status == 206 or status == 304:
            if status == 200:
                if headers.get('content-type') == 'text/html; charset=UTF-8':
                    # inject style sheet / scripts
                    index = response.find('</head>')
                    if index == -1:
                        logging.warning("</head> tag missing from document %s", url)
                    else:
                        response = response[:index] + links + response[index:]
                    index = response.find('<script ')
                    if index == -1:
                        logging.warning("<script> tag missing from document %s", url)
                    else:
                        response = response[:index] + get_scripts() + response[index:]
            headers['etag'] = 'W/"%s"' % etag
        else:
            if 'location' in headers:
                location = urlsplit(headers['location'])
                if location.netloc:
                    url = urlsplit(url)
                    if location.netloc == url.netloc:
                        location = location._replace(scheme='', netloc='')
                        location = location.geturl()
                        headers['location'] = request.script_root + location
        headers['x-robots-tag'] = 'noindex, nofollow'
        return response, status, headers.iteritems()
    except urlfetch_errors.Error as e:
        logging.exception("Couldn't fetch URL %s", url)
        if isinstance(e, urlfetch_errors.DeadlineExceededError):
            abort(504)
        else:
            abort(502)
