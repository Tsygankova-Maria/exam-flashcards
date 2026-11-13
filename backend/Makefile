CXX      = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra
TARGET   = server

.PHONY: all run clean

all: $(TARGET)

$(TARGET): main.cpp
	$(CXX) $(CXXFLAGS) -o $(TARGET) main.cpp

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET)