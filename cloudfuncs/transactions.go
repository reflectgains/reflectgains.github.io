package p

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
)

var bscAPIKey = os.Getenv("BSC_API_KEY")

type Transaction struct {
	BlockHash         string `json:"blockHash"`
	BlockNumber       string `json:"blockNumber"`
	Confirmations     string `json:"confirmations"`
	ContractAddress   string `json:"contractAddress"`
	CumulativeGasUsed string `json:"cumulativeGasUsed"`
	From              string `json:"from"`
	Gas               string `json:"gas"`
	GasPrice          string `json:"gasPrice"`
	GasUsed           string `json:"gasUsed"`
	Hash              string `json:"hash"`
	Timestamp         string `json:"timeStamp"`
	To                string `json:"to"`
	TokenDecimal      string `json:"tokenDecimal"`
	TokenName         string `json:"tokenName"`
	TokenSymbol       string `json:"tokenSymbol"`
	Value             string `json:"value"`
}

type TransactionsResult struct {
	Message string        `json:"message"`
	Result  []Transaction `json:"result"`
}

type GetTransactionsInput struct {
	Contract string `json:"contract"`
	Wallet   string `json:"wallet"`
}

func GetTransactions(w http.ResponseWriter, r *http.Request) {
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

	var parsed GetTransactionsInput
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		log.Println(err)
		http.Error(w, "Error parsing request body", http.StatusBadRequest)
		return
	}

	uri := fmt.Sprintf("https://api.bscscan.com/api?module=account&action=tokentx&address=%s&contractaddress=%s&startblock=1000000&endblock=999999999&sort=asc&apikey=%s", parsed.Wallet, parsed.Contract, bscAPIKey)

	res, err := http.Get(uri)
	if err != nil {
		log.Println(err)
		http.Error(w, "Unable to get transactions from bscscan", http.StatusInternalServerError)
		return
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		log.Println(err)
		http.Error(w, "Unable to read bscscan response", http.StatusInternalServerError)
		return
	}
	res.Body.Close()

	if res.StatusCode != http.StatusOK {
		log.Printf("bscscan returned HTTP %d:\n%s\n", res.StatusCode, string(body))
		http.Error(w, "bscscan return an error", http.StatusInternalServerError)
		return
	}

	var result *TransactionsResult
	if err := json.Unmarshal(body, &result); err != nil {
		log.Println(err)
		http.Error(w, "Unable to parse bscscan response", http.StatusInternalServerError)
		return
	}

	serialized, _ := json.Marshal(result.Result)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(serialized)
}
