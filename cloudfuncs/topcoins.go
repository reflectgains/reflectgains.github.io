package p

import (
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var cachedTopCoins []byte
var lastUpdatedTopCoins time.Time

func GetTopCoins(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "3600")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if len(cachedTopCoins) > 0 && lastUpdatedTopCoins.Add(5*time.Minute).After(time.Now()) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(cachedTopCoins)
		return
	}

	req, _ := http.NewRequest(http.MethodPost, "https://api.livecoinwatch.com/coins/list", strings.NewReader(`{
		"currency": "USD",
		"sort": "rank",
		"order": "ascending",
		"offset": 0,
		"limit": 100,
		"meta": true
	}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", os.Getenv("LIVECOINWATCH_API_KEY"))

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Println(err)
		http.Error(w, "Unable to get top coins", http.StatusInternalServerError)
		return
	}
	defer res.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		log.Println(err)
		if len(cachedTopCoins) > 0 {
			w.Write(cachedTopCoins)
		} else {
			http.Error(w, "Unable to get top coins", http.StatusInternalServerError)
		}
		return
	}

	cachedTopCoins = body
	lastUpdatedTopCoins = time.Now()
	w.Write(cachedTopCoins)
}
