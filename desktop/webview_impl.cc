// The webview library's core is header-only C++. Our shell (hirekit.c) is
// plain C using the C API, so this one C++ translation unit provides the
// compiled implementation the C object file links against.
// WEBVIEW_STATIC makes the API functions `extern` instead of `inline` —
// without it the C object file gets "undefined reference to webview_create".
#define WEBVIEW_STATIC
#include "webview/webview.h"
