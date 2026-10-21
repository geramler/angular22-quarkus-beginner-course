package com.example.policies;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

@QuarkusTest
class PolicyResourceTest {
    private static String tokenFor(String username, String password) {
        return given()
                .contentType("application/json")
                .body(new AuthResource.LoginRequest(username, password))
                .when().post("/api/auth/login")
                .then()
                .statusCode(200)
                .extract().path("token");
    }

    private static String adminToken() {
        return tokenFor("admin", "admin123");
    }

    private static String userToken() {
        return tokenFor("user", "user123");
    }

    @Test
    void listsSeedPolicies() {
        given()
                .auth().oauth2(userToken())
                .when().get("/api/policies")
                .then()
                .statusCode(200)
                .body("$", hasSize(5))
                .body("[0].policyNumber", equalTo("POL-1001"))
                .body("[1].customerName", equalTo("Carlos Ruiz"))
                .body("[4].policyNumber", equalTo("POL-1005"));
    }

    @Test
    void performsPolicyCrudOperations() {
        String token = adminToken();
        Number responseId = given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(new PolicyResource.PolicyRequest("POL-2001", "Lucía Pérez", "ACTIVE"))
                .when().post("/api/policies")
                .then()
                .statusCode(201)
                .body("policyNumber", equalTo("POL-2001"))
                .extract().path("id");
        long id = responseId.longValue();

        given()
                .auth().oauth2(token)
                .when().get("/api/policies/{id}", id)
                .then()
                .statusCode(200)
                .body("customerName", equalTo("Lucía Pérez"));

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(new PolicyResource.PolicyRequest("POL-2001", "Lucía Gómez", "INACTIVE"))
                .when().put("/api/policies/{id}", id)
                .then()
                .statusCode(200)
                .body("customerName", equalTo("Lucía Gómez"))
                .body("status", equalTo("INACTIVE"));

        given()
                .auth().oauth2(token)
                .when().delete("/api/policies/{id}", id)
                .then()
                .statusCode(204);

        given()
                .auth().oauth2(token)
                .when().get("/api/policies/{id}", id)
                .then()
                .statusCode(404);
    }

    @Test
    void rejectsRequestsWithoutToken() {
        given()
                .when().get("/api/policies")
                .then()
                .statusCode(401);
    }

    @Test
    void rejectsInvalidToken() {
        given()
                .auth().oauth2("not-a-valid-token")
                .when().get("/api/policies")
                .then()
                .statusCode(401);
    }

    @Test
    void forbidsWritesForUserRole() {
        given()
                .auth().oauth2(userToken())
                .contentType("application/json")
                .body(new PolicyResource.PolicyRequest("POL-3001", "Sin Permiso", "ACTIVE"))
                .when().post("/api/policies")
                .then()
                .statusCode(403);

        given()
                .auth().oauth2(userToken())
                .when().delete("/api/policies/1")
                .then()
                .statusCode(403);
    }

    @Test
    void rejectsWrongCredentials() {
        given()
                .contentType("application/json")
                .body(new AuthResource.LoginRequest("admin", "wrong"))
                .when().post("/api/auth/login")
                .then()
                .statusCode(401);
    }

    @Test
    void exposesOpenApiAndSwaggerUi() {
        given()
                .when().get("/openapi")
                .then()
                .statusCode(200)
                .body(containsString("/api/policies"))
                .body(containsString("bearerAuth"));

        given()
                .when().get("/swagger-ui/")
                .then()
                .statusCode(200);
    }

    @Test
    void allowsAngularOrigin() {
        given()
                .header("Origin", "http://localhost:4200")
                .auth().oauth2(userToken())
                .when().get("/api/policies")
                .then()
                .statusCode(200)
                .header("Access-Control-Allow-Origin", equalTo("http://localhost:4200"));
    }
}
