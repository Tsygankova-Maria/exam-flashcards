// Минимальный HTTP-сервер на POSIX-сокетах (Linux), C++17.
// Без сторонних библиотек. Порт: 8080.
// GET /api/cards -> каждый раз заново читает data.json с диска.

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

#include <cerrno>
#include <csignal>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace {

constexpr int kPort = 8080;
constexpr std::size_t kMaxRequestSize = 16 * 1024;
const char* const kDefaultDataPath = "data.json";

std::string buildResponse(int status,
                          const std::string& statusText,
                          const std::string& body) {
    std::ostringstream out;
    out << "HTTP/1.1 " << status << ' ' << statusText << "\r\n"
        << "Content-Type: application/json; charset=utf-8\r\n"
        << "Content-Length: " << body.size() << "\r\n"
        << "Access-Control-Allow-Origin: *\r\n"
        << "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
        << "Access-Control-Allow-Headers: Content-Type\r\n"
        << "Cache-Control: no-store\r\n"
        << "Connection: close\r\n"
        << "\r\n"
        << body;
    return out.str();
}

std::string jsonError(const std::string& message) {
    // Сообщения ниже не содержат кавычек и обратных слэшей,
    // поэтому дополнительное экранирование не требуется.
    return std::string("{\"error\":\"") + message + "\"}";
}

bool sendAll(int fd, const std::string& data) {
    std::size_t sent = 0;
    while (sent < data.size()) {
        ssize_t n = ::send(fd, data.data() + sent, data.size() - sent, MSG_NOSIGNAL);
        if (n < 0) {
            if (errno == EINTR) continue;
            return false;
        }
        if (n == 0) return false;
        sent += static_cast<std::size_t>(n);
    }
    return true;
}

// Читает запрос до конца заголовков (\r\n\r\n) или до лимита размера.
std::string readRequest(int fd) {
    std::string request;
    char buffer[2048];
    while (request.size() < kMaxRequestSize) {
        ssize_t n = ::recv(fd, buffer, sizeof(buffer), 0);
        if (n < 0) {
            if (errno == EINTR) continue;
            break;  // таймаут или ошибка
        }
        if (n == 0) break;
        request.append(buffer, static_cast<std::size_t>(n));
        if (request.find("\r\n\r\n") != std::string::npos) break;
    }
    return request;
}

struct RequestLine {
    std::string method;
    std::string path;
};

RequestLine parseRequestLine(const std::string& request) {
    RequestLine line;
    std::size_t lineEnd = request.find("\r\n");
    std::string first = request.substr(0, lineEnd);
    std::istringstream iss(first);
    std::string target;
    iss >> line.method >> target;
    std::size_t q = target.find('?');
    line.path = (q == std::string::npos) ? target : target.substr(0, q);
    return line;
}

std::string handleCards(const std::string& dataPath) {
    std::ifstream file(dataPath, std::ios::in | std::ios::binary);
    if (!file.is_open()) {
        std::cerr << "[ошибка] не удалось открыть файл: " << dataPath << std::endl;
        return buildResponse(404, "Not Found",
                             jsonError("Файл data.json не найден на сервере"));
    }

    std::ostringstream content;
    content << file.rdbuf();
    if (file.bad()) {
        std::cerr << "[ошибка] сбой чтения файла: " << dataPath << std::endl;
        return buildResponse(500, "Internal Server Error",
                             jsonError("Не удалось прочитать файл data.json"));
    }

    return buildResponse(200, "OK", content.str());
}

std::string handleRequest(const std::string& request, const std::string& dataPath) {
    if (request.empty()) {
        return buildResponse(400, "Bad Request", jsonError("Пустой запрос"));
    }

    RequestLine line = parseRequestLine(request);
    std::cout << line.method << ' ' << line.path << std::endl;

    if (line.method == "OPTIONS") {
        return buildResponse(204, "No Content", "");
    }
    if (line.method == "GET" && line.path == "/api/cards") {
        return handleCards(dataPath);
    }
    if (line.path == "/api/cards") {
        return buildResponse(405, "Method Not Allowed", jsonError("Метод не поддерживается"));
    }
    return buildResponse(404, "Not Found", jsonError("Маршрут не найден"));
}

}  // namespace

int main(int argc, char* argv[]) {
    // Необязательный аргумент: путь к файлу данных.
    const std::string dataPath = (argc > 1) ? argv[1] : kDefaultDataPath;

    std::signal(SIGPIPE, SIG_IGN);

    int serverFd = ::socket(AF_INET, SOCK_STREAM, 0);
    if (serverFd < 0) {
        std::cerr << "socket(): " << std::strerror(errno) << std::endl;
        return 1;
    }

    int opt = 1;
    if (::setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        std::cerr << "setsockopt(): " << std::strerror(errno) << std::endl;
        ::close(serverFd);
        return 1;
    }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(kPort);

    if (::bind(serverFd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        std::cerr << "bind(): " << std::strerror(errno)
                  << " (порт " << kPort << " уже занят?)" << std::endl;
        ::close(serverFd);
        return 1;
    }

    if (::listen(serverFd, 16) < 0) {
        std::cerr << "listen(): " << std::strerror(errno) << std::endl;
        ::close(serverFd);
        return 1;
    }

    std::cout << "Сервер запущен: http://localhost:" << kPort << "/api/cards\n"
              << "Файл данных: " << dataPath << std::endl;

    while (true) {
        sockaddr_in clientAddr{};
        socklen_t clientLen = sizeof(clientAddr);
        int clientFd = ::accept(serverFd, reinterpret_cast<sockaddr*>(&clientAddr), &clientLen);
        if (clientFd < 0) {
            if (errno == EINTR) continue;
            std::cerr << "accept(): " << std::strerror(errno) << std::endl;
            continue;
        }

        // Таймаут чтения, чтобы «зависший» клиент не блокировал сервер.
        timeval tv{};
        tv.tv_sec = 5;
        tv.tv_usec = 0;
        ::setsockopt(clientFd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

        std::string request = readRequest(clientFd);
        std::string response = handleRequest(request, dataPath);
        sendAll(clientFd, response);

        ::shutdown(clientFd, SHUT_RDWR);
        ::close(clientFd);
    }

    ::close(serverFd);
    return 0;
}