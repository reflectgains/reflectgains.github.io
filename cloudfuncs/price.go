package p

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
)

type GetPriceInput struct {
	Code string `json:"code"`
}

func GetPrice(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "3600")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	bytes, err := ioutil.ReadAll(r.Body)
	if err != nil {
		log.Println(err)
		http.Error(w, "Error getting request body", http.StatusBadRequest)
		return
	}

	var parsed GetPriceInput
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		log.Println(err)
		http.Error(w, "Error parsing request body", http.StatusBadRequest)
		return
	}

	req, _ := http.NewRequest(http.MethodPost, "https://api.livecoinwatch.com/coins/single", strings.NewReader(fmt.Sprintf(`{
		"currency": "USD",
		"code": "%s",
		"meta": false
	}`, parsed.Code)))

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", os.Getenv("LCW_API_KEY"))

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Println(err)
		http.Error(w, "Unable to get price from LiveCoinWatch", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	defer res.Body.Close()
	io.Copy(w, res.Body)
}
