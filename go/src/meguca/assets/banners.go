package assets

import (
	"math/rand"
	"sync"
	"time"
)

var (
	// Banners by board stored in memory
	Banners = BannerStore{
		m: make(map[string][]File, 64),
	}
)

// Contains data and type of a file stored in memory
type File struct {
	Data []byte
	Mime string
}

func init() {
	rand.Seed(time.Now().Unix())
}

// Stores multiple files by board in memory
type BannerStore struct {
	m  map[string][]File
	mu sync.RWMutex
}

// Set files stored for a certain board.
// Technically deleting a board would leak memory, but it's so rare and little.
func (s *BannerStore) Set(board string, files []File) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[board] = files
}

// Returns the banner specified by board and ID. If none found, ok == false.
// file should not be muatted.
func (s *BannerStore) Get(board string, id int) (file File, ok bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	files := s.m[board]
	if id < 0 || id >= len(files) {
		return
	}
	return files[id], true
}

// Returns a random banner for the board. If none found, ok == false.
func (s *BannerStore) Random(board string) (id int, mime string, ok bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	files := s.m[board]
	if len(files) == 0 {
		return
	}
	i := rand.Intn(len(files))
	return i, files[i].Mime, true
}
