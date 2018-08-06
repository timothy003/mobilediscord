package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"html/template"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

var (
	links []byte
	tmpl  *template.Template
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		log.Fatal("$PORT must be set")
	}

	// disable HTTP/2 client
	tr := http.DefaultTransport.(*http.Transport)
	tr.TLSClientConfig = &tls.Config{
		ClientSessionCache: tls.NewLRUClientSessionCache(0),
	}
	tr.MaxIdleConns = 0
	tr.MaxIdleConnsPerHost = int(^uint(0) >> 1) // unlimited
	tr.IdleConnTimeout = 300 * time.Second
	tr.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}

	var err error
	if links, err = ioutil.ReadFile("links.html"); err != nil {
		log.Fatal("failed to read links.html: ", err)
	}
	tmpl = template.Must(template.ParseFiles("scripts.html"))

	http.Handle("/", &httputil.ReverseProxy{Director: director, ModifyResponse: modifyResponse})
	http.Handle("/md/", http.NotFoundHandler())
	http.Handle("/assets/md/", http.StripPrefix("/assets/md", addHeaders(http.FileServer(http.Dir("static")))))

	srv := &http.Server{Addr: ":" + port}

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)
	idleConnsClosed := make(chan struct{})
	go func() {
		<-shutdown

		// We received an interrupt/termination signal, shut down.
		if err := srv.Shutdown(context.Background()); err != nil {
			// Error from closing listeners, or context timeout:
			log.Printf("HTTP server Shutdown: %v", err)
		}
		close(idleConnsClosed)
	}()

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		// Error starting or closing listener:
		log.Printf("HTTP server ListenAndServe: %v", err)
	}

	<-idleConnsClosed
}

func director(req *http.Request) {
	req.URL.Scheme = "https"
	if strings.HasPrefix(req.Host, "canary") {
		req.URL.Host = "canary.discordapp.com"
	} else if strings.HasPrefix(req.Host, "ptb") {
		req.URL.Host = "ptb.discordapp.com"
	} else {
		req.URL.Host = "discordapp.com"
	}
	req.Host = req.URL.Host

	if !strings.HasPrefix(req.URL.Path, "/assets/") {
		// read uncompressed response
		delete(req.Header, "Accept-Encoding")
	}

	// remove Cloudflare headers (Cloudflare rejects requests with Cf-Connecting-Ip)
	for k := range req.Header {
		if strings.HasPrefix(k, "Cf-") {
			delete(req.Header, k)
		}
	}

	if _, ok := req.Header["User-Agent"]; !ok {
		// explicitly disable User-Agent so it's not set to default value
		req.Header.Set("User-Agent", "")
	}
}

func modifyResponse(res *http.Response) error {
	// remove __cfduid cookie to let Cloudflare cache
	delete(res.Header, "Set-Cookie")

	if res.StatusCode >= 500 {
		return nil
	}

	// hide from search engines
	res.Header.Set("X-Robots-Tag", "noindex, nofollow, noarchive, nocache, noimageindex, noodp")

	if strings.HasPrefix(res.Request.URL.Path, "/assets/") {
		return nil
	}

	// prevent caching HTML (assets might not load while offline)
	if cc := res.Header.Get("Cache-Control"); !strings.Contains(cc, "no-cache") &&
		!strings.Contains(cc, "no-store") &&
		!strings.Contains(cc, "max-age") {
		res.Header.Add("Cache-Control", "max-age=0")
	}

	if !strings.HasPrefix(res.Header.Get("Content-Type"), "text/html") {
		return nil
	}

	// inject links and scripts
	s, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return err
	}
	res.Body.Close()
	if i1 := bytes.Index(s, []byte("</head>")); i1 == -1 {
		log.Print("modifyResponse: missing </head> tag")
	} else if i2 := bytes.Index(s[i1:], []byte("<script ")); i2 == -1 {
		log.Print("modifyResponse: missing <script> tag")
	} else {
		i2 += i1
		origin := "https://" + res.Request.URL.Host
		r, w := io.Pipe()
		go func() {
			err := tmpl.Execute(w, origin)
			w.CloseWithError(err)
		}()
		res.Body = ioutil.NopCloser(io.MultiReader(
			bytes.NewReader(s[:i1]),
			bytes.NewReader(links),
			bytes.NewReader(s[i1:i2]),
			r,
			bytes.NewReader(s[i2:]),
		))
		res.Header.Del("Content-Length")
		res.Header.Del("Etag")

		for _, key := range []string{"Content-Security-Policy", "Content-Security-Policy-Report-Only"} {
			v := res.Header[key]
			for i, csp := range v {
				// add origin for API requests
				csp = strings.Replace(csp, "'self'", "'self' "+origin, -1)
				// add unsafe-inline fallback for CSP 1 compatibility
				csp = strings.Replace(csp, "'nonce-", "'unsafe-inline' 'nonce-", -1)
				v[i] = csp
			}
		}

		return nil
	}
	res.Body = ioutil.NopCloser(bytes.NewReader(s))
	return nil
}

func addHeaders(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=600, stale-if-error=1200")
		h.ServeHTTP(w, r)
	})
}
