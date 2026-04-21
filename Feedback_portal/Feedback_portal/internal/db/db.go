package db

import (
	"database/sql"
	_ "github.com/lib/pq"
	"log"
)

var DB *sql.DB

func Init(dbUrl string) {
	var err error
	DB, err = sql.Open("postgres", dbUrl)
	if err != nil {
		log.Fatal(err)
	}
	if err = DB.Ping(); err != nil {
		log.Fatal(err)
	}

	// Configure connection pool
	DB.SetMaxOpenConns(25)       // Maximum number of open connections
	DB.SetMaxIdleConns(5)        // Maximum number of idle connections
	DB.SetConnMaxLifetime(5 * 60) // Connection lifetime in seconds (5 minutes)
}
