FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /bridge
RUN useradd --uid 10002 --create-home bridge
COPY --chown=bridge:bridge bridge.py .
USER 10002:10002
CMD ["python", "bridge.py"]
