(function () {
    "use strict";

    function parseQueryParameters() {
        var query = location.search.slice(1);
        return query.split("&").reduce(function (queryParameters, rawPair) {
            var pair = rawPair.split("=").map(decodeURIComponent);
            queryParameters[pair[0]] = pair[1];
            return queryParameters;
        }, {});
    }

    const uiError = document.getElementById("ui-error");
    function clickRefresh() {
        location.replace(queryParameters.failureUrl);
        uiError.hidden = true;
        document.getElementById("loading").hidden = false;
    }
    document.getElementById("page-unavailable-refresh").onclick = event => {
        clickRefresh();
    };
    document.getElementById("not-connected-refresh").onclick = event => {
        clickRefresh();
    };
    const notConnected = document.getElementById("not-connected");
    const pageUnavailable = document.getElementById("page-unavailable");
    function checkConnection() {
        if (navigator.onLine) {
            notConnected.hidden = true;
            pageUnavailable.hidden = false;
        } else {
            notConnected.hidden = false;
            pageUnavailable.hidden = true;
        }
    }
    checkConnection();
    const error = document.getElementById("error");
    var queryParameters = parseQueryParameters();
    if (queryParameters.httpStatus)
        error.textContent = `HTTP ${queryParameters.httpStatus}`;
    else if (queryParameters.failureName)
        error.textContent = `Error: ${queryParameters.failureName}`;
    else
        error.hidden = true;
    uiError.hidden = false;
    window.ononline = event => {
        setTimeout(clickRefresh, 1000);
    };
    window.onoffline = event => {
        checkConnection();
    };
}());
