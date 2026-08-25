package event

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// Standard Event Topics across UOP Microservices
const (
	TopicOpportunityCreated = "opportunity.created"
	TopicOpportunityMatched = "opportunity.matched"
	TopicOpportunityStatus  = "opportunity.status_changed"
	TopicChainChildSpawned  = "chain.child_spawned"
	TopicUserTrustUpdated   = "user.trust_updated"
	TopicNotificationSend   = "notification.send"
)

// Event represents an asynchronous inter-service event payload
type Event struct {
	ID        string                 `json:"id"`
	Topic     string                 `json:"topic"`
	TraceID   string                 `json:"trace_id"`
	Timestamp time.Time              `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
}

// EventHandler is a callback function invoked when a topic event is received
type EventHandler func(ctx context.Context, evt Event) error

// EventBus defines the contract for async message publishing and subscription
type EventBus interface {
	Publish(ctx context.Context, topic string, data map[string]interface{}) error
	Subscribe(topic string, handler EventHandler)
	Close()
}

// MemoryEventBus provides a high-performance in-memory channel-based event bus implementation
type MemoryEventBus struct {
	mu          sync.RWMutex
	subscribers map[string][]EventHandler
	eventChan   chan Event
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
}

// NewMemoryEventBus initializes an in-memory event bus instance
func NewMemoryEventBus(bufferSize int) *MemoryEventBus {
	ctx, cancel := context.WithCancel(context.Background())
	eb := &MemoryEventBus{
		subscribers: make(map[string][]EventHandler),
		eventChan:   make(chan Event, bufferSize),
		ctx:         ctx,
		cancel:      cancel,
	}

	eb.wg.Add(1)
	go eb.dispatchLoop()

	return eb
}

// Subscribe registers an event handler for a specific topic
func (eb *MemoryEventBus) Subscribe(topic string, handler EventHandler) {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	eb.subscribers[topic] = append(eb.subscribers[topic], handler)
	log.Printf("[EventBus] Subscribed handler to topic: %s\n", topic)
}

// Publish dispatches an event to all subscribed handlers asynchronously
func (eb *MemoryEventBus) Publish(ctx context.Context, topic string, data map[string]interface{}) error {
	traceID := ""
	if tid, ok := ctx.Value("trace_id").(string); ok {
		traceID = tid
	}

	evt := Event{
		ID:        fmt.Sprintf("evt_%d", time.Now().UnixNano()),
		Topic:     topic,
		TraceID:   traceID,
		Timestamp: time.Now(),
		Data:      data,
	}

	select {
	case eb.eventChan <- evt:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	default:
		log.Printf("[EventBus] Warning: Event channel full, dropping event on topic: %s\n", topic)
		return fmt.Errorf("event bus channel buffer overflow on topic: %s", topic)
	}
}

// dispatchLoop processes events from the internal channel in a background goroutine
func (eb *MemoryEventBus) dispatchLoop() {
	defer eb.wg.Done()
	for {
		select {
		case <-eb.ctx.Done():
			return
		case evt, ok := <-eb.eventChan:
			if !ok {
				return
			}
			eb.mu.RLock()
			handlers := append([]EventHandler(nil), eb.subscribers[evt.Topic]...)
			eb.mu.RUnlock()

			for _, h := range handlers {
				handlerCopy := h
				go func(e Event, handler EventHandler) {
					if err := handler(eb.ctx, e); err != nil {
						log.Printf("[EventBus] Error executing handler for topic %s: %v\n", e.Topic, err)
					}
				}(evt, handlerCopy)
			}
		}
	}
}

// Close gracefully terminates the event bus dispatcher
func (eb *MemoryEventBus) Close() {
	eb.cancel()
	close(eb.eventChan)
	eb.wg.Wait()
	log.Println("[EventBus] Event bus closed cleanly.")
}
