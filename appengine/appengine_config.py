import os
import sys
from google.appengine.ext import vendor

# prevent click from importing ctypes on the development server
if os.environ.get('SERVER_SOFTWARE', '').startswith('Development'):
    if sys.platform.startswith('win'):
        sys.platform = ''
# Add any libraries installed in the "lib" folder.
vendor.add('lib')
