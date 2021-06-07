package p

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
)

type GetTransactionInput struct {
	ChainID       int    `json:"chain_id"`
	TransactionID string `json:"transaction_id"`
}

func GetTransaction(w http.ResponseWriter, r *http.Request) {
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

	var parsed GetTransactionInput
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		log.Println(err)
		http.Error(w, "Error parsing request body", http.StatusBadRequest)
		return
	}

	uri := fmt.Sprintf("https://api.covalenthq.com/v1/%d/transaction_v2/%s/?no-logs=true&key=%s", parsed.ChainID, parsed.TransactionID, os.Getenv("COVALENT_API_KEY"))

	res, err := http.Get(uri)
	if err != nil {
		log.Println(err)
		http.Error(w, "Unable to get transactions from covalent", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	defer res.Body.Close()
	io.Copy(w, res.Body)
}
