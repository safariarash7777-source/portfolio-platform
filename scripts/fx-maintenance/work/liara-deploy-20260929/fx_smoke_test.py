import sys
from streamlit.testing.v1 import AppTest

at = AppTest.from_file("/app/app.py", default_timeout=90).run()
print("LOGIN_INPUTS", [widget.label for widget in at.text_input])
print("LOGIN_BUTTONS", [widget.label for widget in at.button])
print("EXCEPTIONS", [error.message for error in at.exception])
assert not at.exception, 'Login page execution failed'
if "--auth" in sys.argv:
    password = sys.stdin.readline().rstrip("\n")
    at.text_input[0].set_value(password)
    at.button[0].click().run(timeout=180)
    print("AFTER_LOGIN_INPUTS", [widget.label for widget in at.text_input])
    print("AFTER_LOGIN_EXCEPTIONS", [error.message for error in at.exception])
    print("DASHBOARD_TITLES", [widget.body for widget in at.title][:5])
    print("DASHBOARD_TAB_COUNT", len(at.tabs))
    assert not at.exception and len(at.tabs)==12, 'Authenticated dashboard execution failed'
