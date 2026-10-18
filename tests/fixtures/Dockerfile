# syntax=docker/dockerfile:1
ARG NODE_VERSION=18
FROM --platform=linux/amd64 node:18.19-alpine AS build
RUN npm ci
FROM build AS test
FROM mcr.microsoft.com/dotnet/aspnet:6.0
FROM docker.io/library/debian:bookworm-slim
FROM postgres:16@sha256:abc
FROM python
FROM node:${NODE_VERSION}
FROM scratch
