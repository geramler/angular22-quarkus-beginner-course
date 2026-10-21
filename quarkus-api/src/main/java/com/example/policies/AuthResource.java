package com.example.policies;

import io.smallrye.jwt.build.Jwt;
import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

@Path("/api/auth")
@Tag(name = "Authentication")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {
    @ConfigProperty(name = "app.auth.admin-password")
    String adminPassword;

    @ConfigProperty(name = "app.auth.user-password")
    String userPassword;

    @ConfigProperty(name = "app.auth.token-minutes")
    long tokenMinutes;

    @POST
    @Path("/login")
    @PermitAll
    @Operation(summary = "Exchange credentials for a JWT bearer token")
    public TokenResponse login(LoginRequest request) {
        if (request == null || request.username() == null || request.password() == null) {
            throw new WebApplicationException(Response.Status.UNAUTHORIZED);
        }

        Map<String, String[]> users = Map.of(
                "admin", new String[]{adminPassword, "ADMIN"},
                "user", new String[]{userPassword, "USER"});
        String[] credentials = users.get(request.username());
        if (credentials == null || !matches(credentials[0], request.password())) {
            throw new WebApplicationException(Response.Status.UNAUTHORIZED);
        }

        String token = Jwt.issuer("policies-api")
                .upn(request.username())
                .groups(Set.of(credentials[1]))
                .expiresIn(Duration.ofMinutes(tokenMinutes))
                .sign();
        return new TokenResponse(token, "Bearer", tokenMinutes * 60);
    }

    private static boolean matches(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    public record LoginRequest(String username, String password) {
    }

    public record TokenResponse(String token, String tokenType, long expiresInSeconds) {
    }
}
